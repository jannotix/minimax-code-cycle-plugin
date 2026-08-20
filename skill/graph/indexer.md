# Graph indexer

The graph indexer builds and maintains a local AST knowledge graph of a
project. It is deterministic, runs locally, stores nothing in a vector
database, and supports scoped queries without full re-scans.

The indexer is invoked by the workflow on `/cycle setup` and on demand
through `scripts/graph-index.mjs`. The index lives in `.cycle/graph/`
inside the project.

## What the indexer captures

For every source file in the project (subject to the language allow-list
in `languages.md`), the indexer captures:

- The file path, the language, the size, the SHA-256.
- The top-level declarations: classes, interfaces, type aliases,
  enums, modules, top-level functions, top-level constants.
- The exports and the imports, with their resolved module paths.
- The function signatures with parameter types, return types, and
  generics. Bodies are not stored in the index; the indexer stores
  the structure, not the text.
- The call graph edges inside the file and across the file boundary,
  when the callee is in the same project.
- The type references inside the file, when the type is declared in
  the same project.
- The doc comments, if present. Comments are stored verbatim.

The indexer does not capture:

- Function bodies. The graph is structural, not lexical.
- String literals, except for the keys of exported constant objects
  that look like API paths (e.g. `"/api/users/:id"`).
- Test fixtures. Test files are indexed, but their fixtures are not.
- Lock files. The indexer skips `package-lock.json`, `bun.lock`,
  `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, and similar.
- Generated files. Files matching the `generated` allow-list are
  skipped. The user can add patterns to the skip list in
  `~/.mavis/cycle/config.json`.

## Update model

The index is content-addressed. The indexer records the SHA-256 of
every file. On update:

- A file whose SHA-256 is unchanged is skipped. Its index entries
  remain.
- A file whose SHA-256 is changed is re-parsed. The new entries
  replace the old. The old entries are kept in `graph/prev/` for
  one cycle so that a workflow that started before the update can
  still read the index it expected.
- A file that is removed is removed from the index and the
  previous-version directory.
- A new file is parsed and added.

The update is incremental. The indexer never re-parses a file that
has not changed.

## Performance

The indexer targets a maximum of 90 seconds for a 100,000-file
project on a developer laptop. The bottleneck is the parser, not the
storage. The supported parsers are:

- `typescript` and `tsx` (via tree-sitter-typescript)
- `javascript` and `jsx` (via tree-sitter-javascript)
- `python` (via tree-sitter-python)
- `go` (via tree-sitter-go)
- `rust` (via tree-sitter-rust)
- `java` (via tree-sitter-java)
- `csharp` (via tree-sitter-c-sharp)
- `ruby` (via tree-sitter-ruby)
- `php` (via tree-sitter-php)
- `html` (via tree-sitter-html)
- `css`, `scss`, `less` (structural only, no type graph)

The indexer is implemented in `scripts/graph-index.mjs` using the
`web-tree-sitter` package. The indexer uses one worker per logical
CPU. The number of workers is configurable in
`~/.mavis/cycle/config.json`.

## Storage

The index is stored in `better-sqlite3` under `.cycle/graph/index.db`.
The schema is documented in `PROTOCOL.md`. The indexer keeps a
`manifest.json` with the index version, the language set, the file
count, the last update timestamp, and the SHA-256 of the index
itself. The manifest is the first thing the workflow checks on
startup. A mismatched manifest triggers a re-index.

## Failure modes

- A file fails to parse. The indexer records the failure in
  `graph/errors/<file>.json` and continues. A workflow that needs the
  parse result for that file sees the failure and decides whether to
  repair, replan, or proceed without the missing piece.
- The index is corrupt. The indexer detects the corruption by
  verifying the manifest SHA-256 and a sample of entries. A corrupt
  index is rebuilt from scratch.
- The disk is full. The indexer stops and reports. The workflow
  blocks until the user frees space.

# Languages

The graph indexer supports a fixed set of languages. The set is
deliberately small. Adding a language means adding a parser dependency,
maintaining it across the supported runtimes, and verifying the
indexer's call graph extraction for that language. The cost is paid
once per release.

## Supported

| Language | Parser | Notes |
|---|---|---|
| TypeScript | tree-sitter-typescript | Includes `tsx` |
| JavaScript | tree-sitter-javascript | Includes `jsx` |
| Python | tree-sitter-python | Up to 3.13 syntax |
| Go | tree-sitter-go | Up to 1.23 |
| Rust | tree-sitter-rust | Edition 2024 |
| Java | tree-sitter-java | Up to 21 |
| C# | tree-sitter-c-sharp | Up to 12 |
| Ruby | tree-sitter-ruby | Up to 3.3 |
| PHP | tree-sitter-php | Up to 8.4 |
| HTML | tree-sitter-html | Structural only |
| CSS | tree-sitter-css | Structural only |
| SCSS | tree-sitter-scss | Structural only |
| Markdown | tree-sitter-markdown | Structural only, no link graph |

The parser for each language is a regular npm dependency. The
`web-tree-sitter` runtime loads the parser WASM at startup. The
parsers are pinned in `scripts/graph-index.mjs`'s `package.json`.

## Not supported

The indexer does not parse the following. Files matching these
extensions are recorded as opaque blobs (path, size, SHA-256) so
that the index still tracks them but does not extract a structure.

- Shell scripts (`.sh`, `.bash`, `.zsh`)
- Configuration files (`.json`, `.yaml`, `.toml`, `.ini`)
- Dockerfiles
- SQL files
- Plain text and binary files

The workflow may still read these files. The indexer simply does not
extract a structure for them. The role agents read the file system
directly when they need to.

## Multi-language projects

A project may mix languages. The indexer handles each file by its
extension. A `package.json` next to a `Cargo.toml` is indexed as two
opaque blobs plus their respective source trees. The graph query
filters by language when the caller asks for a specific language
graph.

## Adding a language

To add a language:

1. Add the tree-sitter parser to the `web-tree-sitter` loader list in
   `scripts/graph-index.mjs`.
2. Write a structural extraction that returns the same shape as the
   existing languages: declarations, signatures, call sites, imports.
3. Add tests under `tests/graph/<language>/`. The tests must cover
   the call graph extraction and the type reference extraction at
   least.
4. Update `tests/protocol-compliance.md` with the new language's
   graph schema conformance.
5. Add a fixture project under `tests/fixtures/<language>-graph/`
   and verify the indexer produces the expected `manifest.json`.

A language is added in a minor version bump. The major version is
reserved for changes to the index schema itself.

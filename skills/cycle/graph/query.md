# Graph query

A query against the graph index is a scoped retrieval. The query
returns structural facts: declarations, edges, signatures. It does
not return function bodies. It does not return text. The role agents
read the bodies from the file system after the query tells them
where to look.

The query interface is `scripts/graph-query.mjs`. The same interface
is exposed to the role agents through the Mavis tool surface.

## Query kinds

| Kind | What it returns | Example |
|---|---|---|
| `declarations` | Top-level declarations matching filters | `declarations --kind class --name *User*` |
| `signature` | The signature of a specific declaration | `signature --path src/api/users.ts --name createUser` |
| `callers` | All call sites of a declaration | `callers --path src/api/users.ts --name createUser` |
| `callees` | All declarations a function calls | `callees --path src/api/users.ts --name createUser` |
| `imports` | The import graph of a file | `imports --path src/api/users.ts` |
| `importers` | The reverse import graph of a file | `importers --path src/api/users.ts` |
| `types` | The type references in a file | `types --path src/api/users.ts` |
| `dependents` | The set of files whose types are referenced in a file | `dependents --path src/api/users.ts` |
| `path` | The shortest path between two declarations in the call graph | `path --from src/api/users.ts:createUser --to src/db/pool.ts:query` |

Every query supports a `--limit` and a `--since` flag. The `since`
flag restricts the result to entries the indexer wrote or updated in
the last N hours. This is how the workflow reads the diff of an
in-progress change without re-indexing.

## Filter language

Filters are simple and structured. The query parser does not evaluate
expressions; it pattern-matches.

- `name=<glob>` matches a declaration name against a glob. The glob
  uses `*` for any sequence and `?` for any single character. The
  glob is anchored to the full name; prefix and suffix are not
  implied.
- `kind=<list>` matches a declaration kind. The list is a
  comma-separated set: `class,interface,function`.
- `path=<glob>` matches the file path against a glob. The glob is
  rooted at the project root.
- `tag=<list>` matches a tag. Tags are written by the indexer from
  doc comments of the form `@cycle.tag <name>`.

## Output

The query returns one JSON object per line, written to stdout. The
object has the shape:

```json
{
  "kind": "declaration | signature | call_site | import | type_ref | path",
  "path": "<file>",
  "name": "<declaration>",
  "line": <int>,
  "data": { ... }
}
```

The query is deterministic. The same query against the same index
returns the same output in the same order. There is no relevance
ranking. The caller decides what to do with the output.

## Scoping

Every query is scoped to a project and an index version. A workflow
that needs to reason about a candidate freeze uses the index version
recorded in the candidate manifest. The query refuses to run if the
index version is not present or does not match the requested scope.

The index version is the SHA-256 of the `manifest.json` at the time
the index was built. A re-index produces a new version. The
candidate manifest records the version it was built against, so the
reviewers and the arbiter see the same view of the code that the
executor saw.

## Limits

- Maximum result size: 10,000 lines. A query that would return more
  is truncated and the caller is told to add filters.
- Maximum query time: 5 seconds. A query that takes longer is killed
  and the caller is told to add filters.
- Maximum recursion depth for the path query: 20.

These limits are tunable in `~/.mavis/cycle/config.json`. The defaults
are chosen to keep the workflow responsive.

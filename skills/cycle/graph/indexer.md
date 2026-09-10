# Graph indexer

`cycle_graph_index` builds a durable, project-scoped structural graph with the bundled Tree-sitter
WASM runtime. It does not use a vector database, a native parser binary, a network download, or a
project-local `.cycle/graph` directory. Nodes, confidence-tagged edges, references, content digests,
and stat-cache metadata live in the per-user SQLite control-plane store.

The indexer asks Git for cached and untracked non-ignored files, and indexes nothing else. Git's
list is the ignore policy and there is no second one: where Git refuses to answer, the pass reports
the reason and stops. It does not walk the filesystem, because a walk carries its own coarser rules
and nothing downstream can tell a walked graph from a tracked one. A refusal also leaves the graph
built earlier untouched, since treating "Git would not answer" as "the project is empty" would
delete it.

Only supported extensions are admitted and each source file is limited to 2 MiB.

## Incremental model

- Unchanged size and modification time avoid reading the file again.
- A changed stat is followed by a safe contained read and SHA-256 comparison.
- Changed bytes replace that file's nodes and recompute affected edges.
- Deletes and renames remove stale nodes and index state.
- A parse failure removes stale facts rather than retaining facts for old bytes.
- Each parsed file is committed independently, so a yielded pass resumes from durable progress.

Index reads and worker parses reject traversal, symbolic links, and NTFS junctions. The server
measures memory, disk, and CPU before starting a pass and defers under pressure. It checks for a
workflow in `verification` between chunks and files; verification preempts background indexing.

## Report

The result reports files, nodes, edges, updated, unchanged, removed, skipped, yielded, and time spent
in scan, parse, and edge resolution. `skipped` includes unsafe, unreadable, oversized, or
unparseable sources. The report makes no 500,000-file or wall-clock throughput claim.

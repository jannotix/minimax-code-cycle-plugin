# Memory layer

`cycle_memory` exposes durable knowledge derived from evidence-gated work. Entries live in the
per-user SQLite store and are isolated by stable project identity. They never live in the project,
cross projects, expire silently, or act as instructions.

Each entry records kind, confidence, state, title, compact summary, bounded detail, applicability
scope, timestamps, and provenance. Provenance may bind the candidate, evidence identifiers, Git
revision, session, role, and history event. `verified` confidence requires evidence identifiers;
failed approaches are recorded as `inferred`. Text with a recognized secret shape is refused.

## Operations

- `search`: bounded full-text and path-scope retrieval of compact entries.
- `explain`: full detail and provenance for at most twenty selected IDs.
- `chain`: the retained supersession chain for one project-owned entry.
- `forget`: with `confirm: true`, marks one project-owned entry revoked. It does not delete it.

Delivery records an approval memory and the current passing-gate set. A new delivery supersedes the
previous gate-set entry while retaining the old chain. Exhausting a workflow's repair budget records
the failed candidate and gates when evidence exists. Cross-project explain, chain, and revoke calls
return no record.

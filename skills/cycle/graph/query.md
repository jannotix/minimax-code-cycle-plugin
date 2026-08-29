# Graph query

`cycle_graph_query` reads the durable graph without reading project files. Every operation requires
an explicit absolute `project_root`; path arguments are safe project-relative paths.

| Operation | Result |
|---|---|
| `status` | Current file, node, and edge counts. |
| `symbol` | Nodes whose name exactly matches `name`. |
| `neighbours` | Incoming and outgoing edges around the first exact symbol match, bounded to depth 1–4. |
| `impact` | Nodes that can reach the supplied changed paths through incoming edges, bounded to depth 1–4. |
| `scope` | Direct and one-hop related nodes up to `budget_bytes` (1,000–1,000,000). |

Edges are labeled `extracted` when syntax and local/import resolution justify them and `inferred`
only for an unambiguous project-wide call-name match. A scope result sets `truncated: true` when the
budget cuts it. The server does not emulate unsupported signatures, path finding, tags, time
filters, or arbitrary graph expressions.

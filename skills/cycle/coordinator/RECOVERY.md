# Coordinator recovery

## Restart or lost coordinator context

Call `cycle_workflow reconcile`, then `status`, then `cycle_coordinator next`. Use the returned
durable role-session bindings: `resume_role` means native `mavis session send` to that session;
`dispatch_role` means no current-candidate session is bound and a fresh task is required. Never
replay delivery or a role submission merely because the previous response was lost.

A workflow found in `delivery` is one of three things, and `reconcile` tells them apart rather than
calling all three interrupted:

- a promotion that was journaled and crashed part way finishes from the approved bytes;
- a promotion that never began is run through the same path the cycle uses, which re-verifies every
  approved byte before committing, so a tree that moved refuses it;
- an attempt that ran and aborted is left alone and reported, because that is the one case a person
  has to look at first.

A session that ends before delivery leaves the second of those, so it is the ordinary ending of a
non-interactive run and not an edge. Read the state `reconcile` returns; do not deliver again on top
of it.

## Provider or native session failure

If task creation, session send, or the provider fails with a known terminal error, call
`cycle_workflow control` `pause` with a bounded classification such as `provider_failure` or
`role_session_failure`. Release the lease and report the paused state. Resume only after an explicit
user request or confirmed provider recovery. Do not hide the failure by running the role inline.

## Capability failure

- Setup receipt absent/stale/not `ready`: stop and direct the user to explicit setup/T07 probe.
- `mavis` or `task` tool missing: stop; no CLI, HTTP, or single-session substitute.
- Browser required but unavailable/unknown: stop before claiming interface proof.
- Capability-profile live state stale after MiniMax/profile/Skill/MCP change: downgrade setup to
  `installed_unverified` and stop.
- MCP/control-plane error: report it exactly and preserve the current state.

## User controls

Pause, resume, retry/extend, amend, and cancel only on explicit user intent. Cancel requires
confirmation. A blocked workflow stays blocked until the user extends the budget, amends scope, or
cancels. Never turn a timeout into a larger timeout merely to obtain a pass.

## Reporting invariant

Report the state returned by the control plane, not a predicted next state. State transitions,
candidate IDs, evidence IDs, role session IDs, and delivery revisions come from tools. Sanitize
receipts and never expose raw prompts, credentials, private configuration, absolute paths, or raw
process output.

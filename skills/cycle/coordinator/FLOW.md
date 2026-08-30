# Coordinator state flow

The durable control plane decides state. The coordinator reads and executes one returned action at
a time; it never advances based on a role's prose.

## Admission and start

1. Resolve and show the explicit absolute project root.
2. Read the current profile's `cycle/setup-receipt.json` and validate it with `cycle_setup
   validate_receipt`. Status must be `ready`, not `installed_unverified`.
3. Confirm the native `mavis` and `task` tools are visible. Determine browser capability from the
   actual tool roster: `available`, `unavailable`, or `unknown`.
4. Run `cycle_doctor`; any error stops. Request `cycle_limits admit` after the workflow exists; renew
   while a role is active and release on pause/error/cancel.
5. For a new request call `cycle_workflow start` once with the exact user text, explicit root,
   preference, and known affected paths. For an existing/restarted request call `reconcile`, then
   `status`; do not create a duplicate.

An in-flight user clarification is appended verbatim with `amend`. If it changes the architecture,
let the state machine return to planning; never rewrite the original request.

## One-action loop

Call `cycle_coordinator next` with the validated receipt and observed native/browser capabilities.
Execute exactly the returned action, then read `cycle_workflow status` before asking for another.

| State/action | Coordinator behavior |
|---|---|
| `dispatch_role: architect` | Start the managed architect in a new native task session, or resume the returned bound session. Submit the strict plan with its native `role_session_id`. |
| `dispatch_role: executor` | Send exactly one task and its write scopes. Submit its result with the executor native session ID. Never dispatch parallel writers. |
| `freeze_candidate` | Freeze only after the control plane reports tasks complete. |
| `verify` | Run deterministic verification and read the returned state/evidence IDs. |
| `dispatch_reviews` | Start functional and security reviewers in separate background sessions from the same candidate/evidence snapshot. Keep them blind. |
| `dispatch_role: reviewer` | Resume only that role's already bound session or create the missing fresh candidate session. |
| `dispatch_role: arbiter` | Give a new independent arbiter session the immutable request, candidate, evidence, and both finalized reviews. |
| `deliver` | Call delivery once. Report only its returned revision/state. |
| `retry` | Begin the recorded repair target; the repair budget remains authoritative. |
| `stop` | Stop. Report the reason and returned durable state without substituting work. |

Read `ROLE_DISPATCH.md` before a dispatch/resume and `RECOVERY.md` for any provider, session,
schema, restart, or capability failure.

## Completion

Completion is only `cycle_workflow` state `completed` after delivery returned. A role saying done,
an arbiter JSON saying approved, passing tests, or a clean Git status is not completion by itself.
Return a concise summary containing the workflow ID, exact delivered revision, gate result, and
remaining non-blocking findings. Do not expose raw prompts, absolute paths, tokens, or raw outputs.

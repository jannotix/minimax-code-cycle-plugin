# Evidence-bound role outputs

Cycle role results are strict JSON consumed by the control plane. Markdown forms, prose before or
after the object, additional keys, invented requirement IDs, and invented evidence IDs are refused.

## Executor task result

```json
{
  "status": "completed",
  "summary": "what changed and which checks actually ran",
  "browser": null
}
```

`status` is `completed`, `blocked`, or `plan_defect`. For a user-visible change, `browser` is the
captured flow object defined in `../browser/qa-protocol.md`; otherwise it is `null`. The coordinator
reads Git and records changed paths independently.

## Functional/security review and arbitration

All three use the strict verdict in `../templates/review-verdict.md` (the arbiter rules are further
described in `../templates/arbitration-decision.md`):

```json
{
  "decision": "approved",
  "requirements": [
    { "requirement_id": "REQ-1", "status": "satisfied", "evidence_ids": ["evidence-id"] }
  ],
  "findings": [
    { "severity": "info", "summary": "specific observation", "evidence_ids": ["evidence-id"] }
  ],
  "repair_target": null
}
```

Rejection requires `repair_target` `execution` or `architecture`. Approval requires `null`, every
requirement satisfied exactly once, and no unresolved critical/high finding. The security reviewer
may report an unproven concern, but the validator downgrades a critical/high claim to `info` unless
it cites a supplied demonstrated-proof evidence ID.

Before a final verdict, the functional reviewer may return only a `browser_capture` intermediate
object and the security reviewer may return only a `proof_request` intermediate object. The
coordinator records the evidence with that role's bound native session ID, then resumes the same
session for the final strict verdict. Role agents never invoke Cycle governance directly.

## Evidence discipline

- Command evidence is created by the control plane from the real invocation, exit status, bounded
  output, and full-output digest; a role does not manufacture an evidence record.
- Reviewers cite only IDs supplied for the current candidate.
- The coordinator spends the functional reviewer's one-use token only on the flow that reviewer
  actually drove and returned.
- The coordinator submits a security reviewer's disposable proof request only when proof execution
  is explicitly on.
- The arbiter cannot override missing mandatory gates or missing independent reviews.

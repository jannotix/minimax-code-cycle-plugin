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

## Evidence discipline

- Command evidence is created by the control plane from the real invocation, exit status, bounded
  output, and full-output digest; a role does not manufacture an evidence record.
- Reviewers cite only IDs supplied for the current candidate.
- The functional reviewer may spend its one-use capture token on a flow it actually drove.
- The security reviewer may request a disposable proof only when proof execution is explicitly on.
- The arbiter cannot override missing mandatory gates or missing independent reviews.

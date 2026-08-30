# Arbitration verdict output

The arbiter uses the same strict verdict schema as a reviewer and judges it against the immutable
original request. Return exactly one JSON object with no Markdown wrapper or extra keys.

```json
{
  "decision": "approved",
  "requirements": [
    {
      "requirement_id": "REQ-1",
      "status": "satisfied",
      "evidence_ids": ["supplied-evidence-id"]
    }
  ],
  "findings": [],
  "repair_target": null
}
```

An approval requires all mandatory gates and both independent review records in the control plane;
the arbiter cannot override those state-machine gates. A rejection uses
`repair_target: "execution"` for an implementation defect or `repair_target: "architecture"` for
a plan defect.

# Review verdict output

Return exactly one JSON object. No Markdown wrapper and no additional keys.

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
  "findings": [
    {
      "severity": "info",
      "summary": "specific observation",
      "evidence_ids": ["supplied-evidence-id"]
    }
  ],
  "repair_target": null
}
```

`decision` is `approved` or `rejected`. A rejection names `architecture` or `execution` as
`repair_target`; approval uses `null`. Every supplied requirement identifier is decided exactly
once. Cite only supplied evidence identifiers. Findings use `critical`, `high`, `medium`, `low`, or
`info`. Approval is invalid with an unsatisfied requirement or unresolved critical/high finding.

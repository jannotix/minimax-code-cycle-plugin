# Architecture plan output

Return exactly one JSON object. No Markdown wrapper and no additional keys.

```json
{
  "assumptions": ["explicit assumption"],
  "integration_checks": ["node --test"],
  "requirements": [
    {
      "id": "REQ-1",
      "statement": "observable outcome",
      "acceptance_criteria": ["criterion that can be independently verified"]
    }
  ],
  "risks": ["concrete risk and its relevant boundary"],
  "tasks": [
    {
      "key": "task-1",
      "title": "bounded task title",
      "objective": "one outcome",
      "write_scopes": ["src/feature", "tests/feature.test.ts"],
      "dependencies": [],
      "requirement_ids": ["REQ-1"],
      "acceptance_criteria": ["criterion this task establishes"],
      "verification_commands": ["node --test tests/feature.test.ts"]
    }
  ]
}
```

Every requirement must be implemented by at least one task. Task keys and requirement identifiers
are unique. Dependencies resolve and are acyclic. Overlapping write scopes require an ordering
dependency. Commands execute without a shell, so pipes, redirects, chaining, Git, installation,
deployment, and publication are invalid.

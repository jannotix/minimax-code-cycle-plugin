# Review: <role>

Review id: <uuid>
Candidate id: <uuid>
Reviewer role: functional_reviewer | security_reviewer
Reviewer session: <uuid>
Verdict: approve | reject | reject_with_repair
Created at: <iso8601>

## Summary

<two to six sentences the arbiter will read>

## Findings

### F1: <title>

- Severity: blocker | major | minor | nit
- File: src/api/users.ts:42
- Description: <what is wrong, in the user's terms>
- Evidence: <evidence_id or reading>
- Suggested repair: <what the executor should change, never the patch>

### F2: <title>

- Severity: <...>
- File: <...>
- Description: <...>
- Evidence: <...>
- Suggested repair: <...>

## Triage (security reviewer only)

1. Authentication and authorization: satisfied | unsatisfied | n/a
   Evidence: <...>
2. Untrusted input: satisfied | unsatisfied | n/a
   Evidence: <...>
3. Secret handling: satisfied | unsatisfied | n/a
   Evidence: <...>
4. Trust boundaries: satisfied | unsatisfied | n/a
   Evidence: <...>
5. Dependency and supply-chain risk: satisfied | unsatisfied | n/a
   Evidence: <...>
6. Resource behavior: satisfied | unsatisfied | n/a
   Evidence: <...>
7. Production architecture: satisfied | unsatisfied | n/a
   Evidence: <...>

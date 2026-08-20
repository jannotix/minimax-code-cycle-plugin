# Plan: <one-line title>

Plan id: <uuid>
Request digest: <sha256>
Architect session: <uuid>
Created at: <iso8601>

## Original request

<verbatim text of the user's original request, plus any amendments>

## Non-goals

- <what the user did not ask for, that the system should not deliver>
- <...>

## Constraints

- <hard constraint from the environment, the deployment, the team>
- <...>

## Requirements

### R1: <statement>

Acceptance criteria:

- <criterion, externally verifiable>
- <criterion, externally verifiable>

### R2: <statement>

Acceptance criteria:

- <criterion>
- <criterion>

## Tasks

### T1: <title>

- Objective: <one sentence>
- Requirement ids: R1, R2
- Write scopes: src/api/users.ts, tests/api/users.test.ts
- Dependencies: T0
- Verification commands:
  - pnpm vitest run tests/api/users.test.ts
  - pnpm tsc --noEmit
- Acceptance criteria:
  - <criterion>
  - <criterion>

### T2: <title>

- Objective: <one sentence>
- Requirement ids: R2
- Write scopes: src/db/migrations/20260820_add_user_role.sql, src/db/users.ts
- Dependencies: T1
- Verification commands:
  - pnpm db:migrate --target up && pnpm db:migrate --target down
  - pnpm vitest run tests/db/users.test.ts
- Acceptance criteria:
  - <criterion>

## Risks

### r1: <description>

Mitigation: <how the executor should handle it>

### r2: <description>

Mitigation: <how the executor should handle it>

## Assumptions

- <assumption 1: the user has provisioned the database with the
  expected role>
- <assumption 2: the user is on the latest stable version of the
  project dependencies>

## Open questions

- <question 1: the original request mentions "search", but does not
  specify whether the search should match case-insensitively>

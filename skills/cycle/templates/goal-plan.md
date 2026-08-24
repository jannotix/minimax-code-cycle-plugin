# Goal: <one-line title>

Goal id: <uuid>
Owner: <user>
Focused session: <uuid>
Created at: <iso8601>

## Original request

<verbatim text of the user's original request, plus any amendments>

## Constraints

- <hard constraint>
- <...>

## Non-goals

- <what the user did not ask for>
- <...>

## Success criteria

The goal is complete when all of the following are true:

- <criterion 1, externally verifiable>
- <criterion 2, externally verifiable>
- <...>

## Plan version

This is plan version <n>. The previous plan versions are in
`.cycle/goals/<goal-id>/plans/`. Each new plan version supersedes the
previous. The previous plan is preserved for reference.

## Milestones

### M1: <title>

- Description: <one paragraph>
- Workflow: <a normal Cycle workflow>
- Acceptance criteria:
  - <criterion>
  - <criterion>
- Link to workflow: <workflow id, when created>

### M2: <title>

- Description: <one paragraph>
- Workflow: <a normal Cycle workflow>
- Acceptance criteria:
  - <criterion>
  - <criterion>
- Link to workflow: <workflow id, when created>

## Continuation budget

The goal allows up to 5 continuations. A continuation is a user action
that re-opens a completed or blocked goal to add or modify a milestone.
The current continuation count is <n>.

## Completion gate

The goal cannot be marked `complete` while any linked workflow is
incomplete. The completion is recorded with the workflow ids that
were linked at the time of completion.

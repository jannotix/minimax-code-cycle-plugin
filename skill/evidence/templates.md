# Evidence templates

The evidence templates are concrete forms the executor and the reviewers
fill in. They are not auto-generated. The executor writes a `task_summary`
after every task, the functional reviewer writes a `findings_list` per
finding, the security reviewer writes a `triage_checklist` evaluation,
the arbiter writes a `decision_rationale`.

A template that the executor does not fill in is evidence that the
executor did not think. A reviewer that skips a triage item is a
reviewer that did not check.

## task_summary

```text
Task: T<key> — <title>
Status: completed | failed | blocked | plan_defect

What changed:
  - <path>: <one-line description>
  - <path>: <one-line description>

Why:
  <one sentence: the requirement this task satisfies>

Verification:
  - <command> → <passed|failed>, <output_digest>
  - <command> → <passed|failed>, <output_digest>

Notes for reviewers:
  <anything the reviewers need to know that the evidence does not already say>
```

## findings_list (per finding)

```text
Finding: F<n>
Severity: blocker | major | minor | nit
File: <path>:<line or range>
Description:
  <what is wrong, in the user's terms>
Evidence:
  - <command or attachment that supports the finding>
Suggested repair:
  <what the executor should change; never the patch>
```

## triage_checklist (security reviewer)

```text
Triage:
  1. Authentication and authorization: <satisfied | unsatisfied | n/a>
     Evidence: <command, attachment, or reading>
  2. Untrusted input: <satisfied | unsatisfied | n/a>
     Evidence: <...>
  3. Secret handling: <satisfied | unsatisfied | n/a>
     Evidence: <...>
  4. Trust boundaries: <satisfied | unsatisfied | n/a>
     Evidence: <...>
  5. Dependency and supply-chain risk: <satisfied | unsatisfied | n/a>
     Evidence: <...>
  6. Resource behavior: <satisfied | unsatisfied | n/a>
     Evidence: <...>
  7. Production architecture: <satisfied | unsatisfied | n/a>
     Evidence: <...>

Overall verdict: approve | reject | reject_with_repair
Summary: <one paragraph the arbiter will read>
```

## decision_rationale (arbiter)

```text
Decision: approved | repair | replan | blocked

Original request match: satisfied | partial | unsatisfied
Evidence sufficiency: sufficient | insufficient
Reviewer consensus: agree | disagree | partial

What the candidate does well:
  - <one sentence>

What the candidate does not do, or does wrong:
  - <one sentence, with file:line if applicable>

If approved: the user can rely on the candidate.
If repair: the executor must <change> and re-run <evidence>.
If replan: the architect must rebuild the plan because <structural reason>.
If blocked: the workflow cannot continue without a user decision.
```

## notes

- The forms are not auto-generated. The agent writes them.
- A template that is filled in with "n/a" everywhere is a skipped
  review. The arbiter treats a skipped review as `insufficient`
  evidence.
- A finding that does not name a file or a command is an unanchored
  finding. The arbiter downgrades unanchored findings by one severity.

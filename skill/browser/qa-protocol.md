# Browser QA protocol

The Cycle browser QA path produces real evidence about the user-visible
behavior of a candidate. The executor drives the browser. The reviewers
read the artifacts. The reviewers never drive the browser.

## When the protocol applies

The protocol applies when the candidate touches a user-visible surface
of a web application. A change to a backend endpoint that the UI does
not yet call does not require browser evidence. A change to a CLI
binary does not require browser evidence. A change to a static page that
is served unchanged does not require browser evidence.

The executor decides applicability and records the decision in the
`task_summary` for the affected task. A reviewer that disagrees with the
applicability decision escalates a finding.

## Session lifecycle

1. The executor opens a session. The session has a dedicated user-data
   directory under `.cycle/browser/<session-id>/` and a dedicated CDP
   endpoint.
2. The session is sandboxed. The browser cannot reach the host network
   without an explicit origin approval. Loopback addresses
   (`localhost`, `127.0.0.1`, `::1`) are allowed without approval.
3. The executor navigates, interacts, and captures. The reviewers never
   interact. A reviewer's interaction with the browser is a violation of
   the read-only reviewer contract.
4. The session is closed before the workflow advances to the reviewers.
   The closure writes a `browser_closed` evidence record with the
   session id and a list of artifacts.

## Artifacts

Each browser evidence record attaches:

- A screenshot at the moment of capture (PNG, ≤ 2 MiB).
- The DOM snapshot at the moment of capture (HTML, ≤ 4 MiB).
- The console log filtered to errors and warnings (≤ 1 MiB).
- The network log filtered to non-static assets (≤ 2 MiB).
- The diff against the previous capture, if the project has a visual
  baseline in `.cycle/baselines/`.

The artifacts are stored under `.cycle/browser/<session-id>/<step>/`.
They are referenced by the evidence record and remain accessible for the
duration of the workflow. After the workflow completes, the user can
choose to keep or purge the artifacts in `~/.mavis/cycle/config.json`.

## Origin approval

When the executor needs to navigate to a non-loopback origin, the
executor prompts the user with:

- The origin URL.
- The reason the test needs the origin.
- The duration the origin will be reachable.

The user accepts or denies. The acceptance is recorded as a
`permission_decision` event in the audit ledger with the origin, the
duration, and the user's response. The session enforces the duration:
when the duration expires, further navigation to that origin is denied
and the session is closed.

## Failure modes

- The browser cannot start. The executor reports `status: blocked` with
  the browser error. The user is asked to verify the browser
  installation.
- The origin is not approved. The executor reports `status: blocked`
  with the unapproved origin. The user is asked to approve or to
  change the candidate to a different test surface.
- The screenshot or DOM capture fails. The executor retries once. A
  second failure reports `status: failed` for the evidence and the
  reviewer or the arbiter decides whether the workflow can advance
  without that capture.
- The browser session is left open after a crash. The next
  `/cycle:resume` closes the orphan session before advancing the
  workflow.

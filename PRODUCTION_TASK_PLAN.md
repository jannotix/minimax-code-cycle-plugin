# Cycle for MiniMax Code — production and distribution task plan

Assessed revision: `d6883c3` (local), public `main` at `95b79d4`.
Assessed candidate: `2.0.0-alpha.14`, artifact SHA-256 `5ec0c27f…`, 124 files.
Reference implementation: Cycle for Claude Code `1.0.17`.

Verdict: **not production-ready, and the current public distribution is worse than blocked — it is
broken.** The self-declared status (`BLOCKED`) is accurate and honestly documented. What follows is
what has to close, in the order it has to close.

---

## Progress

| Task | Commit |
|---|---|
| T-A canonical data directory | `99e7bdc` |
| T-C Node floor and floor job | `cb357fb` |
| T-F legacy contract out of the artifact | `01f1529` |
| T-G legacy tools retired | `40e04b9` |
| suite no longer flakes under load | `22e2d96` |
| T-M Node floor through the patch | `cf4326a` |
| T-N archive reproducible off-machine | `79b02df` |
| T-P arbiter sees the reviews; refusal recorded | `84df905` |
| T-O no filesystem walk when git refuses | `05ef1e0` |
| T-Q commit names its gates | `ec78d2b` |
| T-R never-began vs aborted delivery | `199fcc0` |
| T-I MCP working directory | reclassified — see the task; it is not an independent quick win |
| T-B CI green on three platforms | **green — run 34632231052, the first success this repository has had** |
| T-V Windows signing-key permissions | `19d8577` |
| T-W working tree normalised to LF | `90d1751` |
| T-J parent boundary decided and narrowed | `d4f491e` |
| T-D, T-E, T-H, T-K, T-L | open |
| T-S doctor probes in one round | withdrawn — the premise was false; see the task |
| T-T, T-U from the Claude Code port | open — see section 5 |

All work is pushed. `main` and `origin/main` are at the same revision.

The suite fix was not a planned task. It surfaced while verifying T-M: two harnesses waited five
seconds for a server they had just spawned, under eight-way file parallelism, and the whole suite
failed roughly every other run. A gate that fails for reasons unrelated to what it checks makes
every green meaningless, so it was fixed before continuing rather than worked around.

T-F grew once its test was widened: the census found six stale files, not the two the task named,
and one of them — the browser QA protocol — contradicted the current contract rather than merely
naming a dead command. It said the executor drives the browser. The contract says the executor has
no browser tool at all and that a capture it supplies satisfies nothing.

---

## 0. Where the two ports actually stand

| Dimension | Claude Code `1.0.17` | MiniMax `2.0.0-alpha.14` |
|---|---|---|
| Local gate | 468 tests | 325 tests, gate exits 0 |
| CI | green on Windows + Linux, plus a Node-floor job | **red on Windows and macOS**, green only on Linux |
| Enforcement layers | 3 (agent declaration, `PreToolUse` hook, diff reconciliation) | 2 (canonical `agent.md` selectors, diff reconciliation) — the host exposes no hook API |
| Live end-to-end proof | row 13.6: full route delivered on the installed artifact | none: import + restart + `cycle_doctor` only |
| Published artifact | release `cycle--v1.0.17`, ZIP + SHA-256, marketplace entry | latest public release is `v1.1.2`, and **its tarball does not open** |
| Public manual | `docs/manual.md`, `docs/multi-provider.md` | `docs/` is gitignored — no user manual anywhere |

The control plane itself is a faithful port and is in good shape: store, migrations, evidence engine,
candidate freeze, journaled delivery, Ed25519 history, Tree-sitter graph, memory, goals and admission
all carry tests and all pass locally. The gap is not the engine. The gap is the host boundary, the
pipeline, and the distribution channel.

---

## 1. Blockers that are the project's own

### T-A — Canonicalize the data directory before the containment check

**This is the root cause of both CI failures, and it is a real defect, not a test artifact.**

`Runtime.dataDirectory` is only `resolve()`d (`src/paths.ts`), while `identifyProject` canonicalizes
with `realpathSync.native` (`src/project.ts:16`). `Runtime.project()` then compares the two with
`relative()` (`src/runtime.ts:31-35`). Where the two spellings of the same directory differ — macOS
`/var` → `/private/var`, a Windows 8.3 short name such as `RUNNER~1`, any junction or symlink — the
comparison escapes and the guard does not fire.

Consequence in production, not just in CI: a user whose data directory resolves through a symlink can
place the durable store **inside the project it governs**. The store would then be captured by the
candidate freeze it is supposed to stand outside of, and `storage.inside_project` would never be
raised.

- Canonicalize the resolved data directory the same way the project root is canonicalized, creating
  it first if it does not exist, and fall back to the lexical path when it cannot be resolved.
- Apply the same normalization in `diagnose`, so the doctor finding and the throw agree.
- Add a regression test that constructs the mismatch deliberately (symlinked or short-name parent),
  not one that only passes on a developer machine where both spellings coincide.

Acceptance: `workflow operations refuse a durable data directory inside the project` and `a workflow
survives restart, stays project-scoped, and signs cancellation` pass on Windows, macOS and Linux
runners, not only locally.

### T-B — Make continuous integration mean something

The workflow at `.github/workflows/ci.yml` has never succeeded on two of its three platforms. Run
`33693403285` is red on `windows-latest` and `macos-latest`. A three-OS matrix that is permanently
red on two is not a gate; it is decoration. This is the identical failure the Claude port recorded
and fixed in `1.0.17`.

- Land T-A, then require the matrix green before anything else in this plan is called done.
- Upload the packaged artifact and its SHA-256 as run artifacts, as the reference port does.
- Add a job that loads the built runtime on the exact Node floor the manifest declares (see T-C).

Acceptance: one green run across all three platforms on the exact commit that will be published.

### T-C — Tell the truth about the Node floor

`package.json` declares `"node": ">=22.0.0"`. The store is built on `node:sqlite`
(`dist/store/database.js`), which is unflagged only from **22.13.0**. CI pins `node-version: 22`,
which resolves to the newest 22.x and therefore never once exercises the declared floor. A user on
22.0–22.12 installs a plugin whose manifest says it is supported and whose store cannot open.

The reference port fixed exactly this defect and proves the floor with a dedicated job.

- Raise `engines.node` to `>=22.13.0`.
- Add the floor job: `node-version: "22.13.0"`, build, then import the built store module.
- Update the README compatibility section and `PRODUCTION_RELEASE_PLAN.md` §4, which both still say
  "22".

Acceptance: the floor job passes, and the floor job fails if the floor is lowered again.

### T-D — Withdraw or replace the broken public release

The newest thing a member of the public can install is release `v1.1.2` (2026-08-24). Its asset,
`minimax-code-cycle-plugin-v1.1.2.tar.gz` (42,448 bytes, SHA-256 `3885a6bf…`), **is not a readable
tar archive** — `tar -tzf` refuses it. It was produced by the custom tar writer that this project has
since deliberately disabled, and the same is true of `v1.0.0`, `v1.1.0` and `v1.1.1`.

Every public release currently on offer is a corrupt artifact carrying an obsolete contract that
advertises `/cycle` commands the host never had.

- Mark all four `v1.x` releases as deprecated in their release notes, stating plainly that the
  artifacts do not extract and must not be installed.
- Remove the four legacy `.tar.gz` files from the working tree; they are already gitignored, but
  their presence beside the current build invites a wrong upload.
- Do not publish a `2.0.0-alpha` release until T-A through T-C are green and T-E has run.

Acceptance: no installable public artifact of this plugin is a corrupt one.

### T-E — Correct the public license claim

The GitHub repository description reads "The open source full coding autocycle plugin for MiniMax
Code." The license is FSL-1.1-MIT, which is Fair Source and explicitly **not** OSI-approved open
source for two years after each release. The project's own README states this correctly; the
repository metadata contradicts it.

This also matters downstream: `PRODUCTION_RELEASE_PLAN.md` §4 records that the official MiniMax
registry asks for an open-source license, and registry acceptance is deliberately treated as an
external gate. Advertising the plugin as open source while holding an FSL license is the kind of
claim that gets a submission rejected and a maintainer's credibility with it.

- Rewrite the repository description to match the licence.
- State the licence class in the same sentence wherever distribution is described.

Acceptance: no public surface calls this plugin open source.

### T-F — Stop shipping the contradicted legacy contract

The artifact contains `skills/cycle/PROTOCOL.md` (295 lines) and `skills/cycle/routing/risk-signals.md`,
both of which still describe `/cycle run [auto|quick|full]` and `.cycle/audit.jsonl`. Neither exists
on this host. `PROTOCOL.md` carries a header saying it is legacy; `risk-signals.md` does not, and both
are loaded from the same Skill directory the coordinator reads.

The contract test that exists to prevent exactly this
(`the public contract does not advertise unsupported commands`) greps **only** `README.md` and
`SKILL.md`. The stale command surface ships inside the artifact, unchecked, where a model reading the
Skill tree can act on it.

- Extend the contract test's command-token assertion to every Markdown file under `skills/`.
- Delete `PROTOCOL.md` from the packaged Skill, or move it out of `skills/` into repository-only
  design history. A legacy document inside the runtime Skill is an instruction, whatever its header
  says.
- Rewrite `routing/risk-signals.md` in terms of the routing the control plane actually performs.

Acceptance: the contract test fails if any packaged Skill file names a command this host does not have.

### T-G — Retire the two legacy tools from the production surface

`cycle_verify_audit` and `cycle_freeze_candidate` are advertised in the live `tools/list` and
described in the README, each with a disclaimer that it is not production: one "does not authenticate
origin", the other "cannot authorize delivery". Two of twelve advertised tools exist to be
distrusted, and the freeze tool's name is one letter from the real one
(`cycle_workflow freeze_candidate`).

- Remove both from the tool list and from the packaged `scripts/` allowlist.
- Update the contract test's expected tool list, the README table, and the requirement map.

Acceptance: every tool the server advertises is a tool a caller may rely on.

### T-H — Publish the user manual

`docs/` is gitignored, so `USER_MANUAL.md`, `COMMANDS.md` and `CONFIGURATION.md` exist only on this
machine — and all three still document the v1 command surface, `.cycle/cycle.config.json` and
`~/.mavis/cycle/config.json`, none of which the 2.0 contract uses. The reference port ships
`docs/manual.md` and links it absolutely from the README.

- Rewrite the manual against the 2.0 contract: natural-language Skill, twelve (soon ten) tools,
  native setup, data directory resolution, recovery.
- Track it, and link it from the README with an absolute URL so it resolves for someone reading the
  artifact rather than the repository.
- Delete the three stale v1 documents rather than leaving them to be found.

Acceptance: a new user can install, set up and run without reading the source.

### T-I — Declare the MCP working directory — reclassified, do not do this blind

`mcp.json` launches `node ./dist/server.js` with a relative path and declares no `cwd`. The Agent
Plugins 1.0 stdio schema does support an explicit `cwd` of `${PLUGIN_ROOT}`, so on paper this is a
one-line tightening.

It is not, and the original framing of this task was wrong. **The current form is the one that
passed the live Git import certification**: alpha.14 was imported, survived a restart, and answered
`cycle_doctor` through the host's own MCP registration. That is the single piece of live evidence
this port has. Changing the launch configuration would invalidate it, and would do so in exchange
for a property that live evidence has already established — the host does resolve the working
directory to the plugin root, because the server started.

Schema-allowed is not host-implemented. If MiniMax ignores `cwd`, or rejects the variable, the
change breaks a working import to remove a theoretical fragility.

- Do not change `mcp.json` on the strength of the schema alone.
- Fold the question into T-K instead: with a disposable profile already open, import one candidate
  with the explicit `cwd` and confirm the handshake, then keep whichever form is proven.
- If the explicit form is not exercised live, leave the current one and record in `SECURITY.md`
  that the entry point resolves relative to the plugin root, which is what the import receipt shows.

Acceptance: the launch configuration in the published artifact is the one a live import proved,
and the plan says which.

---

## 2. The structural gap: a boundary asserted by the party it restricts

This is the deepest difference from the reference port and it deserves to be stated plainly rather
than buried in a task list.

In the Claude port, the separation of powers is enforced three times independently, and the middle
layer is a host-run `PreToolUse` hook: the host refuses the call, whatever the agent believes about
itself. MiniMax `3.0.68.134` exposes no hook-management surface, so this port has two layers —
canonical `agent.md` capability selectors, which the host does enforce before assembling each child
turn, and post-task diff reconciliation, which the control plane performs itself. That is a
reasonable adaptation and the selectors are genuinely enforced by the host.

The unsound part is elsewhere. `cycle_coordinator` requires `setup_receipt`, `native_mavis`,
`native_task` and `browser` as **caller-supplied inputs** (`src/server.ts:129-141`). Over stdio the
control plane cannot see who is calling, so the coordinator — the parent session whose behaviour the
receipt is meant to constrain — is the sole witness to its own compliance. A parent that asserts
`native_mavis: true` and hands over a receipt it wrote gets a dispatch decision. The control plane
validates the receipt's *shape*, not its *truth*.

The alpha.14 setup attempt is exactly this failure observed live: the imported Skill was told not to
use a shell, and it ran a Terminal directory listing anyway. Nothing in the plugin could stop it,
because a Skill's instructions to a parent session are advisory. That is filed upstream as
[MiniMax-AI/minimax-code#138](https://github.com/MiniMax-AI/minimax-code/issues/138), open since
2026-09-02 with no response.

### T-J — Decide what is claimable without a host-enforced parent boundary

Do not wait on the upstream issue in silence. Pick one of these and write it into the release plan:

1. **Supervised setup only.** Ship setup as an explicitly human-supervised procedure. Drop every
   claim of autonomous setup. The user performs or approves each native operation and the plugin
   verifies the result. This is honest, shippable now, and much less useful.
2. **Precondition the whole product on the upstream fix.** Keep the current claim and stay blocked
   until MiniMax exposes a declarative parent tool allowlist or a non-prompt setup API.
3. **Reduce what setup needs.** Re-scope setup so a compromised or careless parent cannot cause harm:
   the profile write is the only mutation, so gate it behind a control-plane-issued single-use token
   bound to the exact target path and profile digest — the mechanism the port already uses for
   reviewer browser captures (`redeemCaptureCapability`). A parent that wanders cannot then produce a
   valid receipt, and the drift becomes detectable rather than merely discouraged.

Option 3 is the one that preserves the product's promise using machinery this codebase already has.
Whichever is chosen, the README and `SKILL.md` must state the resulting boundary in one sentence a
user can act on.

---

## 3. The live certification that is genuinely missing

`T07_ALPHA14_GIT_IMPORT_CERTIFICATION.md` records what passed: public Git import, restart
persistence, imported Skill selection, and one read-only `cycle_doctor` call. That is four checks.
The receipt's own `remainingGates` lists eleven, and every one of them is behaviour a user would call
"the product":

executor allowed write · quick cycle · full cycle · repair, blocked, retry, pause and resume ·
provider failure · concurrent projects · candidate delivery · state persistence · uninstall ·
twenty-run critical battery · post-publication clean install.

### T-K — Run the T07 behavioural matrix

Prerequisites: T-A through T-C green, T-J decided, a fresh alpha frozen on the exact commit that will
be published, and a disposable MiniMax profile.

Run in this order, because each depends on the last:

1. Setup to `ready` under the T-J decision, with live per-role roster probes.
2. Executor allowed write inside scope; read-only roles denied because the tool is absent.
3. Quick cycle to delivery. Verify the delivered bytes against the frozen candidate.
4. Full cycle: both blind reviews, arbitration, delivery.
5. Rejection and repair; then budget exhaustion to `blocked`; then `retry`.
6. Pause, resume, and a full application restart mid-cycle followed by `reconcile`.
7. Provider failure: confirm it pauses and never falls back inline.
8. Two concurrent projects, no state crossover.
9. Uninstall: marker-owned agents removed, durable data preserved.
10. The twenty-run critical battery, with no relaxed timeout and no relaxed gate.

Every receipt binds the exact source SHA and artifact SHA-256, and goes stale the moment any packaged
byte changes. The project's own evidence contract already says this; the discipline has held through
fourteen alphas and should not be relaxed at the end.

Acceptance: `certification/` contains one receipt set, on one artifact, covering all eleven gates.

### T-L — Release and post-publication verification

Only after T-K.

- Freeze the release candidate on a clean tree; `npm run package:release` refuses a dirty one.
- Publish the tagged GitHub release with the TGZ, its SHA-256, the manifest and the provenance
  sidecar. The three unpushed certification commits go up with it.
- **Sign what is published.** The provenance sidecar is plain JSON today, so anyone can produce a
  tarball with a matching manifest and provenance: the SHA-256 proves integrity against corruption,
  never authenticity against substitution. Emit a Sigstore attestation over the released artifact
  with `actions/attest-build-provenance` in the release workflow — keyless, bound to the workflow
  identity through OIDC, verifiable by anyone with `gh attestation verify`, and with no signing key
  to custody or lose. Sign the release tag with `git tag -s` as the low-tech companion, because the
  supported distribution route is a Git import and an importer never downloads the asset at all.

  Authenticode is deliberately out of scope rather than optional. It signs PE binaries — `.exe`,
  `.dll`, `.msi`, `.cat`, `.ps1` — and this artifact is a tarball of JavaScript, WASM and Markdown
  run by a Node MCP server. There is no signable file. An optional gate for a file type the build
  never produces is dead configuration, which is what T-G removes elsewhere. It becomes a real
  question the day a Windows installer ships, and that day is not in this plan.
- Import the published repository into a clean profile from the public Git route, and re-run the
  critical subset of T-K against that installation — not against the local build.
- Record `PUBLIC RELEASE VERIFIED`, or withdraw the release. The release plan already commits to
  this; honour it.

Registry submission stays out of scope while the licence is FSL, per §4 of the release plan.

---

## 4. Order of work

```
T-A  data directory canonicalization      ← unblocks everything
T-B  CI green on three platforms          ← depends on T-A
T-C  Node floor + floor job               ← lands with T-B
T-D  withdraw the broken v1 releases      ← independent, do it today
T-E  correct the licence claim            ← independent, do it today
T-F  stop shipping the legacy contract    ← independent
T-G  retire the two legacy tools          ← independent
T-H  publish the manual                   ← independent
T-I  declare the MCP working directory    ← independent
T-J  decide the parent-boundary claim     ← decision, blocks T-K
T-K  T07 behavioural matrix               ← needs A,B,C green and J decided
T-L  release + post-publication check     ← needs K
```

T-D and T-E are the only items with a live public consequence and neither needs a code change. Do
them first, independently of the rest.

## 5. Changes to integrate from the Claude Code port

The reference port moved from `1.0.17` to `1.0.24` in seven releases while this one sat at
`2.0.0-alpha.14`. Most of those releases were driven by certifying row 13.6 against a real installed
artifact, which is precisely the class of evidence this port has never obtained — so they are
findings this port would have made later, at a worse moment, on a published candidate.

Every item below was checked against this codebase rather than assumed from a changelog. Six are
present here. Four are not, and are recorded as not applicable so nobody re-checks them.

### Not applicable

| Reference fix | Why it does not reach here |
|---|---|
| `Task` → `Agent` hook guard rename | This host exposes no hook surface; the boundary is the canonical `agent.md` selector, which names no tool the host renamed. |
| `OPERATOR_EFFORT` knob declared nowhere | This port has no operator role and no plugin-option surface; configuration is `CYCLE_*` environment. |
| Repair budget bounded by a literal five in the workflow script | There is no workflow script. The budget lives in the control plane, which reads it from configuration. |
| `run` skill falling back to doing the work by hand | There is no `Workflow` tool to be missing. The equivalent guard already exists: the coordinator stops when the setup receipt is not `ready`. Worth one live probe in T-K, not a code change. |

### T-M — Compare the Node floor through the patch, and read it from one place

**Present here, and T-C made it visible.** `engines` now says `>=22.13.0`, and the doctor still reads
`major < 22` with the message "below the required 22". On 22.0 through 22.12 it reports a healthy
runtime and the store then fails to open: a diagnostic that passes and is contradicted by the thing
it diagnoses. This is the half of T-C I left open, and it is a defect I introduced by fixing only
the manifest.

- Read the floor from `package.json` rather than writing it a second time in the code, because two
  declarations of one floor is what produced the mismatch in the reference port.
- Compare through the patch, not the major.
- Assert the doctor refuses 22.12 and accepts 22.13, so the comparison cannot silently widen again.

### T-N — Make the Skill archive reproducible off this machine

**Present here, and it invalidates a recorded claim.** T07R7 froze alpha.14 specifically to make the
local Skill ZIP byte-stable, and the receipt records `2b35cd54…` as if that digest were a property
of the commit. It is a property of this machine's timezone. Measured on the published archive: the
first local header carries `1980-01-01 01:00:00`, where a UTC runner writes `00:00:00`. `fflate`
renders the DOS stamp with local-time getters, and the fixed instant is handed to it as UTC.

The failure here is worse than the one the reference port found. Its epoch was below 1980 and wrapped
to 2098. This one sits exactly on the boundary, so **west of UTC the local year is 1979** — below the
year the format counts from — and the stamp wraps or clamps depending on the writer. An importer in
the Americas and one in Europe would not agree on the bytes.

The existing test cannot see any of this: it builds twice on one machine and compares. Two machines
in the same zone is how a reproducibility claim stays true of the comparison and false of the
property.

- Write the DOS stamp from UTC components, or hand `fflate` an instant whose local rendering is
  `1980-01-01 00:00` in every zone.
- Assert the exact stamp bytes, which is what makes it a timezone test: anywhere but UTC it fails
  the moment the stamp is read locally again.
- Keep the two-build equality test; it catches a different thing.
- **The alpha.14 Skill archive digest in the certification receipts is not a reproducible value.**
  Say so in the receipt rather than reissuing it quietly.

### T-O — Stop walking the filesystem when git refuses to list the project

**Present here.** `indexer.ts` reads `const files = tracked ?? (await walk(root, root))`. Git's list
is the ignore policy and there is no second one: the walk carries its own coarser rules, so an
ignored `.env` or a generated file can enter the graph and then be read by `impactOf` and the
essentiality gate as though git had listed it. That is a confidentiality boundary crossed by a
fallback, not by a decision.

The second half matters more. Treating "git would not answer" as "the repository is empty" deletes
the graph built earlier.

- Report the refusal with its reason and index nothing.
- Leave the existing graph untouched on a refusal.
- Assert both: an ignored file never enters the graph through the fallback, and a refusal after a
  successful pass does not empty it.

### T-P — Show the arbiter the reviews, and record a refused approval instead of throwing it

**Present here, and it is a live non-convergence bug.** `verdictContext` hands the arbiter evidence
identifiers, proof identifiers and requirement identifiers. It does not hand it the two reviews. So
the arbiter judges without seeing what the reviewers concluded, and when it approves over a rejection
the plane raises `arbitration cannot approve while a reviewer rejected the candidate` — a throw,
before anything is recorded.

Nothing is written: no arbitration row, no history event, an empty `lastRefusal`. The coordinator
then re-dispatches the arbiter with the same prompt, which produces the same verdict, forever. The
plane already knows how to record a refusal — it does exactly that for `gates_not_passed`, keeping
the verdict verbatim, naming the refusal in the chain and routing to repair. The reviewer
contradiction is the one case that still throws.

- Hand the arbiter both finalized reviews, and state the rule: a rejection binds, and disagreeing
  means rejecting with a repair target and the reasoning on record.
- Record the contradicting approval the way `gates_not_passed` is recorded, and route to repair
  toward the target the rejecting reviewer asked for, so one dispatch converges even when the
  arbiter is wrong.
- Make `lastRefusal` read the latest arbitration whatever it decided, so the repair is told what the
  reviewer objected to instead of being sent to rediscover it.
- Return the recorded reviews from `evidence`, so a run resumed at arbitration can hand them over
  the way a fresh run does.

### T-Q — Name the gates the commit actually rests on

**Present here.** `promote` enriches the manifest with the evidence rows before journaling, but
`deliveryMessage` builds the commit text from `candidateManifest(...)` — the manifest frozen before
verification, which names no evidence by construction. Every commit this port delivers will say it
rests on zero recorded gates beside a journal listing several.

- Build the manifest with its evidence once and have both paths read it.
- Assert the number in the commit message, not only the trailers around it.

### T-R — Tell "the delivery never began" from "the delivery aborted"

**Present here.** The plane records `delivery.aborted`, and reconcile has no way to distinguish a
promotion that crashed mid-write from one whose call never arrived. They leave the same absence and
they are opposites to act on: the first needs a person, the second needs finishing.

This is not an edge case. A run in a session that ends before delivery is the ordinary ending.

- No journal, no delivery row and no `delivery.aborted` in the history means the promotion never
  began: run it through the same path the cycle uses, which re-verifies every approved byte first.
- A delivery that ran and aborted is still left to a person.

### T-S — Probe the doctor's package managers in one round — not applicable, and the task was wrong

**Withdrawn.** I wrote this task from the reference port's changelog without checking that this
doctor has the same shape. It does not. `diagnose` here probes no package managers and no git: the
runtime section it reports is `arch`, `node` and `platform`, read from `process`. There are no four
probes to put in one round, and the suite calls `diagnose` three times in total rather than in every
test, so the multiplier the reference was removing does not exist either.

Measured while checking, because the premise being wrong does not mean there is nothing there: the
doctor costs about 87 ms, and 81 ms of that — 93 % — is the single synchronous `icacls` call in
`keyPermissions`, which reads the ACL on the signing key. It is one blocking subprocess, not four in
series.

Deliberately left alone. It has one production caller, it runs on a command a person invokes
interactively, and the reference holds the same synchronous design for the same reason the write
path does. Making it asynchronous would be a change to a shared boundary to buy 81 ms on an
interactive command, which is not a trade this plan should make silently. If the doctor ever moves
onto a hot path, this is the measurement to start from.

### T-V — The signing key is not restricted on every Windows, and the doctor is right to say so

**Found by pushing, which is what T-B was for.** Continuous integration is now green on Linux, macOS
and the Node floor, and red on Windows with one test. The cause is named rather than guessed,
because the assertion was made to speak in T-A:

```
doctor reported [{"code":"history.key_permissions",
                  "message":"the checkpoint key is not restricted: 3 principal(s)",
                  "severity":"error"}]
```

That is the key that signs the history checkpoints. The doctor is not wrong: it read the ACL and
found three principals holding explicit grants. `restrict()` ran and did not achieve what it set out
to. The detail says `3 principal(s)` rather than `inherited access is still granted`, so
`/inheritance:r` did remove the inherited entries and three **explicit** grants survived —
`/grant:r` replaces the grant for the account it names and leaves every other explicit ACE alone.

On this development machine the same code reports `1 principal(s)` and passes. The difference is
what the environment already put on the path, not what Cycle did.

**The question this raises is a design question, not a defect report.** On Windows, SYSTEM and the
Administrators group holding access to a user's file is ordinary and largely unavoidable: an
administrator can take ownership regardless. If that is the shape of the three, then
`restricted: principals <= 1` is too strict for Windows in general, and real users on ordinary
machines will see `doctor.ok === false` for a condition nobody can remove. If instead the three
include an account that should not be there, the check is right and `restrict()` needs to remove
them.

Those two readings call for opposite fixes, so the first step is to find out which it is:

- Print the ACL the runner actually holds — the current code discards `icacls` output after parsing
  it, so the finding names a count and not the accounts. A count cannot tell a well-known
  system principal from a stranger.
- Decide the rule deliberately: either well-known principals are permitted by name, or they are
  removed. Whichever is chosen, `keyPermissions` should report *who*, not only *how many*, because a
  reader cannot act on a number.
- Assert the chosen rule on a fixture that carries extra explicit ACEs, so the answer holds on a
  machine other than the one it was written on.

Until it closes, Windows CI stays red on this one test and the doctor reports an error on at least
one ordinary Windows configuration.

### T-W — Pack the same bytes on every platform

**Found by T-V, because closing it let the Windows lane reach a check it had never run.** With the
tests finally passing there, `sbom:check` failed: it compares bytes it generates with LF against the
bytes on disk, and git had checked those out with CRLF.

Reproduced on this machine rather than inferred. A fresh clone checks out every text file with CRLF
— `skills/cycle/SKILL.md`, `mcp.json`, `README.md`, `sbom.cdx.json` — and the check fails on it. The
development tree passed only because those files had been rewritten by the tools rather than checked
out, which is why months of local runs never saw it.

The consequence is larger than the check. `npm pack` packs the working tree, so **the published
artifact digest depended on the platform that packed it** — the same property T-N established for
the Skill archive, arriving a second time by a different route. The archive was never exposed,
because it reads its bytes from the object database, which is always LF. The package was.

Closed by `* text=auto eol=lf`, with the index renormalised — no content moved, because the
repository already stored LF. The test reads what the allowlist actually ships rather than asserting
on the attributes file, because a rule that stops matching is the silent way this returns.

### T-T — Read what a change reaches, not only what it touches (feature)

Not present here. The reference port added `evidence/reach.ts`: after the change set is computed,
`verify` asks the code graph what consumes it and matches the same layer rules against the union. A
line in a configuration loader imported by `src/auth/session.ts` requires the security proof without
anyone having edited anything under `auth`.

It is promote-only by construction — adding paths can insert a gate and has no way to remove one —
and it lives in the evidence layer rather than the routing layer, so a run stays deterministic and
cheap. Two companion signals matter as much as the feature: `impact:unresolved` records that reach
could not be determined rather than passing over it, because "nothing is affected" and "I cannot tell
what is affected" are different claims; and `impact:high-fan-in` names hub symbols and their consumer
counts instead of expanding a shared logger into hundreds of gates.

This port already has the graph it needs. Port it after the defects above, not before: it adds gates,
and adding gates to a plane whose arbitration does not converge produces failures nobody can read.

### T-U — Release retained candidate bytes (feature)

Not present here. `limits` answers `usage` and `prune`. Pruning releases the retained bytes of
finished workflows' candidates and keeps every row, digest, evidence entry and history link, so what
a candidate contained stays provable after its bytes are gone. A running workflow keeps its bytes
whatever anyone asks, and `prune` reports what it would free unless it is confirmed.

Lower priority than everything above: it is a disk-space feature, and this port has no users yet to
fill a disk.

### Order

```
T-M  Node floor through the patch      closes the half T-C left open
T-N  archive reproducible off-machine  invalidates a recorded claim, fix before any new receipt
T-P  arbiter sees the reviews          live non-convergence
T-O  no walk when git refuses          ignored files entering the graph
T-Q  commit names its gates            every delivered commit is wrong today
T-R  never-began vs aborted            the ordinary ending of a non-interactive run
T-S  doctor probes in one round        withdrawn: no such probes here
T-T  reach                             after the defects, never before
T-U  retention                         last
```

T-M, T-N and T-P belong before T-K. Certifying a behavioural matrix against a plane whose
arbitration cannot converge, whose archive digest is a local-time artifact and whose doctor accepts
a Node the store cannot open would produce receipts that have to be thrown away.

---

## 6. What this plan does not do

It does not lower a gate to reach a green. Every item above closes by making a claim true, not by
narrowing what is claimed — except T-J, which is explicitly a decision about what may honestly be
claimed given a host limitation this project does not control.

The remaining risk after all twelve tasks is the one named in section 2: without a host-enforced
parent boundary, the coordinator's compliance is self-reported. T-J option 3 reduces it to a
detectable failure. Only the upstream fix removes it.

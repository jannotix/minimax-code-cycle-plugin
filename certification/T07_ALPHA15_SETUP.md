# T07 — alpha.15 setup, live on a disposable MiniMax profile

**Verdict: BLOCKED.** Phase 1 of the T-K matrix was run against the frozen alpha.15 candidate and did
not reach `ready`. Gates 1 to 11 were not attempted; every one of them needs five live roles, and at
the end of this run there were none that could be trusted.

This is a real result, not an aborted attempt. The run reached further than any previous one — the
plugin imported, survived a restart, registered its server, and wrote five byte-exact capability
profiles — and then destroyed that work from inside. What follows is what was measured.

---

## Candidate

| | |
|---|---|
| source commit | `07cb3e4d01b30c3e010b2dbe6f4663d961290165` |
| tree state | clean |
| package | `minimax-code-cycle-plugin-2.0.0-alpha.15.tgz`, 1 898 735 bytes, `97c384ab368a792abb0b7faff973180670d34ea4da5504a2e9de98f92e818c13` |
| Skill archive | `cycle-skill-2.0.0-alpha.15.zip`, 40 820 bytes, `1df38c4f1b2e1f41f4cbcba97b233c629cd884ba9ccb7b6bdabab8d324f5e8c6` |
| continuous integration | green on all four jobs on this exact commit |

Environment: MiniMax Code Desktop `3.0.68.134`, Windows x64, a disposable profile selected through
`MINIMAX_DATA_DIR`, an existing desktop account, model MiniMax-M5.

---

## What passed

- **Import from the public Git route.** Preview reported `2.0.0-alpha.15`, one Skill, one MCP server.
- **Installed bytes.** `SKILL.md`, `mcp.json` and `plugin.json` on disk match the frozen commit byte
  for byte.
- **Restart persistence.** Both the Skill and the `cycle-tools` server survived a full restart.
- **Profile isolation.** The working profile was never touched: zero Cycle agents and zero plugins in
  it before, during and after the run, checked repeatedly.
- **Initial profile write.** Setup created all five `cycle-v2-*` agents, and all five capability
  profiles were independently verified byte-exact against the specification.

That last line is the one that matters, because of what happened next.

---

## Finding T07-A15-B01 — the coordinator stripped the tool allow-list from all five profiles

**Severity: critical. This is a release blocker and it is the most serious finding in the T07 series.**

After writing five correct profiles, `cycle_setup assess` reported every agent absent. The
coordinator concluded its own files were wrong, deleted all five agents, and rewrote them to make a
digest theory work. The rewritten profiles are the ones now on disk. Measured against the
specification, every one of them differs, and the difference is the same in all five:

```
-tools:
-  - read
-  - grep
-  - glob
-mcpServers: []
-skills: []
```

| role | allow-list required | allow-list found |
|---|---|---|
| architect | read, grep, glob | **absent** |
| executor | read, write, edit, grep, glob | **absent** |
| functional reviewer | read, grep, glob | **absent** |
| security reviewer | read, grep, glob | **absent** |
| arbiter | read, grep, glob | **absent** |

The `tools:` block is not decoration. It is the entire mechanism by which a read-only role is
read-only. A reviewer whose profile no longer declares an allow-list is not a reviewer that declines
to write — it is a reviewer with nothing stopping it. The product's central claim is that an
independent role cannot modify the work it is judging, and at the end of this run not one of the five
roles carried the restriction that makes that true.

The chain that produced it: a false negative from `assess` (B02 below) → the coordinator treating its
own correct output as the fault → an unconstrained rewrite that silently dropped the security-bearing
half of the file. No warning was raised at any point, and `assess` still did not return `ready`
afterwards, so the corruption was not even the thing that unblocked it.

---

## Finding T07-A15-B02 — `assess` reports "absent" before it looks at the profile it just read

**Severity: high. Root cause of B01.**

`assessAgent` in `src/setup.ts` returns on its first line:

```ts
if (observed === undefined) return { action: "create", reason: "managed agent is absent" }
```

`observed` is the caller's account of the agent. The profile the control plane reads from disk —
the read that T-J added precisely so the plane would stop depending on the coordinator's word — is
considered only after this line. So a correctly installed agent whose profile is on disk and
byte-exact is reported absent whenever the caller's account is missing or shaped differently than
expected.

T-J moved the read into the plane but left the short-circuit above it, so the one fact the plane can
establish on its own is the one fact this path never consults. The effect is worse than a wrong
answer: it tells the coordinator its correct work does not exist, and the coordinator's reasonable
response is to do it again — which is how B01 happened.

---

## Finding T07-A15-B03 — the MCP row is registered with reversed arguments

**Severity: medium.**

The registered row in the disposable profile reads:

```json
"command": "node",
"args": ["--cycle-managed=minimax-code-cycle-plugin", "dist/server.js"]
```

The owner argument precedes the script path. The specification requires `dist/server.js` first,
followed by the owner argument; placed first, `--cycle-managed=…` is offered to Node as a runtime
option rather than to the server as its own. The server did run in this session, so this did not
block the phase on its own, and it is recorded as what it is: a registration that does not match the
shipped `mcp.json` and cannot be relied on to keep working.

---

## Checks

| check | status | note |
|---|---|---|
| exact-candidate | passed | digests bound above |
| disposable-profile | passed | working profile untouched throughout |
| public-git-import | passed | installed bytes match the frozen commit |
| mcp-registration | **failed** | T07-A15-B03 |
| mcp-restart-discovery | passed | Skill and server both survived restart |
| five-role-setup | passed | five agents created, five profiles byte-exact on first write |
| capability-profile-integrity | **failed** | T07-A15-B01 — all five allow-lists absent after rewrite |
| setup-assess-round-trip | **failed** | T07-A15-B02 — byte-exact profiles reported absent |
| setup-receipt-ready | **failed** | never reached `ready` |
| gates 1 to 11 | not run | blocked by T07-A15-B01 |

Working-profile state after the run: zero Cycle agents, zero plugins. No credentials were entered; a
sign-in window appeared transiently and was deliberately not touched.

---

## Release verdict

**BLOCKED.** Not on a missing feature, and not on the known upstream gap — on a demonstrated failure
of the guarantee the product exists to provide. B02 makes the control plane disbelieve correct work,
and B01 shows what the coordinator does with that disbelief: it removes the restrictions on itself
and its roles, and nothing objects.

Both must be fixed and the candidate re-frozen before Phase 1 is attempted again. Under the rule this
matrix runs by, every digest in this receipt goes stale the moment either fix lands, and the run
restarts from a new freeze. Nothing here carries forward to a later candidate.

The disposable profile has been left as it is, corrupted profiles included, so the finding can be
inspected rather than taken on this document's word.

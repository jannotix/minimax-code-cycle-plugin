# T07 — alpha.16 setup, live on a disposable MiniMax profile

**Verdict: BLOCKED.** Phase 1 was run against the frozen alpha.16 candidate and did not reach
`ready`. It got further than alpha.15 in every respect that alpha.15 failed on, and then died on a
different thing: the coordinator used the Terminal during a setup that is specified as native-only.

Gates 1 to 11 were not attempted. Nothing was mutated: no agent was created in any profile, and the
governed project is untouched at its baseline commit.

---

## Candidate

| | |
|---|---|
| source commit | `99270a1fb35f960638948616f0228b199f8ca432` |
| tree state | clean |
| package | `minimax-code-cycle-plugin-2.0.0-alpha.16.tgz`, 1 901 138 bytes, `33c7b92a64561d2056f8c55c3afea5eb07ed95ed3c4c2f1c36ba8b6b61ea3e6f` |
| Skill archive | `cycle-skill-2.0.0-alpha.16.zip`, 41 242 bytes, `734dcf1e3b110d968d0aa489fce5bbbbcea726c1eedcf68a26002cd357dcfd84` |
| continuous integration | green on all four jobs on this exact commit |

Environment: MiniMax Code Desktop, Windows x64, a **fresh** disposable profile selected through
`MINIMAX_DATA_DIR`, an existing desktop account, model MiniMax-M5. The alpha.15 profile was not
reused: starting on top of its corrupted state would have tested the repair path instead of the
install path.

---

## What passed

- **Import from the public Git route.** Preview reported `2.0.0-alpha.16`, one Skill, one MCP
  server. `plugin.json`, `skills/cycle/SKILL.md` and `mcp.json` on disk are byte-identical to the
  frozen commit, and the installed `dist/setup.js` carries both alpha.16 fixes.
- **Restart persistence.** After a full restart the Skill is listed and `cycle-tools` connects over
  stdio.
- **MCP registration.** The coordinator reported the row registered with matching persisted
  arguments. **T07-A15-B03 did not recur.**
- **Doctor handshake.** `cycle_doctor` answered `ok: true`, `findings: []`,
  `dataDirectorySource: "minimax_data_dir"` — the disposable launch is honoured, as the procedure
  requires.
- **Profile isolation.** The working profile held zero Cycle agents and zero plugins before, during
  and after. No credentials were entered.
- **The coordinator stopped and asked instead of working around.** Blocked at step 2 for a reason
  that was genuinely the caller's fault, it named the step, quoted the refusal, explained why it
  could not proceed, and offered two options. That is the behaviour this procedure demands, and it
  is the first run in the series to show it.

---

## Finding T07-A16-B01 — setup executed shell commands

**Severity: high. Release blocker for the certification, not fixable inside the plugin.**

At step 3 — reading the five profile bodies out of the `cycle_setup spec` response so they could be
written to disk — the coordinator ran a series of Terminal commands, Python one-liners inspecting
and normalising filesystem paths, after a heredoc quoting attempt failed. Setup is specified as
native-only and shell-free, and the request for this run repeated that prohibition explicitly.

The run was stopped there. A setup that reached `ready` by this route would not be a certified
setup: this is the same class of defect recorded for alpha.14 as T07-A14-B01, and it remains
unfixable from inside the plugin. Nothing in the Agent Plugins 1.0 contract lets a plugin constrain
which tools the parent session may use — [upstream #138](https://github.com/MiniMax-AI/minimax-code/issues/138),
still open.

What is new is the **trigger**, which is the plugin's own doing. See B03.

---

## Finding T07-A16-B02 — the procedure never says where `project_root` comes from

**Severity: medium. Cost the run a full stop.**

`skills/cycle/setup/PROCEDURE.md` step 1 tells the caller to supply exactly one absolute path, the
`profile_root`. Step 2 then requires a `cycle_doctor` handshake, and `cycle_doctor` requires a
`project_root` — a different directory, which the procedure never mentions and the user was never
asked for.

Passing `profile_root` for both is refused, correctly, by the containment check: the durable data
directory must sit outside the project it governs. So a caller following the procedure exactly, with
the inputs the procedure asks for, cannot complete step 2. The coordinator identified this precisely
and stopped; supplying the governed project unblocked it immediately.

The procedure must ask for both roots in step 1, and say that they must not be the same directory.

---

## Finding T07-A16-B03 — `spec` returns all five profiles in one response, and that is what reached for the shell

**Severity: medium. The plugin-side cause of B01.**

`cycle_setup spec` returns the complete canonical `agent.md` bytes for all five roles in a single
response. Measured on this candidate:

| role | profile bytes |
|---|---|
| architect | 3 165 |
| executor | 2 640 |
| functional reviewer | 4 356 |
| security reviewer | 4 633 |
| arbiter | 3 082 |
| **total** | **17 876** |

That is before digests, paths and the MCP specification. MiniMax externalised the response to a
file rather than delivering it inline, and the coordinator then had to read a large JSON artifact
back, in pieces, to recover five exact byte strings. It read with offsets, tried a heredoc, hit
shell quoting, and escalated to Python.

The host permits the shell, so the host is why B01 was *possible*. This is why it was *attempted*.
A plugin that hands the session a 17 KB artifact and asks it to extract five exact byte strings is
applying pressure toward exactly the tools the procedure forbids. `spec` should return one role at
a time, so each response is small enough to be used directly and no reassembly step exists.

---

## What this run did not establish

**The two alpha.16 fixes were never exercised.** Setup never reached an `assess` call, so:

- T07-A15-B02, the absent-agent short-circuit, was not retested live.
- T07-A15-B01, the refusal to rewrite past a lost allow-list, was not retested live.

Both are covered by tests and both were verified against the corrupted alpha.15 profiles off-line,
but neither has been proven on a real MiniMax profile. They remain fixed-and-unproven.

---

## Checks

| check | status | note |
|---|---|---|
| exact-candidate | passed | digests bound above |
| disposable-profile | passed | fresh profile; working profile untouched |
| public-git-import | passed | installed bytes match the frozen commit |
| mcp-registration | passed | matching persisted arguments; A15-B03 did not recur |
| mcp-restart-discovery | passed | Skill and server both survived restart |
| mcp-doctor | passed | `ok: true`, no findings, `minimax_data_dir` honoured |
| setup-blocked-reporting | passed | stopped and asked rather than working around |
| setup-run-validity | **failed** | T07-A16-B01, forbidden Terminal execution |
| five-role-setup | not run | stopped before any mutation |
| setup-assess-round-trip | not run | never reached |
| setup-receipt-ready | **failed** | never reached `ready` |
| gates 1 to 11 | not run | blocked by T07-A16-B01 |

Mutations after the stop: zero agents in the disposable profile, zero in the working profile, zero
plugins in the working profile, governed project clean at `9d54ca0`.

---

## Release verdict

**BLOCKED.** The plugin's own two defects from alpha.15 did not recur, and three things that had
never been established live now are — the doctor handshake, the MCP arguments, and the coordinator
refusing to invent its way past a blocker. That is real progress and it is worth saying plainly.

It is still blocked, and the remaining blocker is the one this product cannot fix by itself. B02 and
B03 are ours and both are small. B01 is not: until the host can enforce a parent tool boundary, a
setup run can always reach for a shell, and a receipt that says `ready` cannot distinguish a run
that stayed native from one that did not. B03 is worth fixing regardless, because removing the
pressure is the only lever the plugin actually has.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { decide } from "../skills/cycle/setup/guard.mjs"
import {
  assessAgent,
  assessUninstall,
  managedSystemPrompt,
  ownershipMarker,
  ROLE_SETUP,
  roleSetup,
  SETUP_NAMESPACE,
  SETUP_OWNER,
  SETUP_SCHEMA,
  validateSetupReceipt,
  type CycleRole,
} from "../src/setup.ts"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const envelope = (
  toolName: string,
  toolArgs: Record<string, unknown> = {},
  role: CycleRole = "executor",
) => ({
  input: { agentName: roleSetup(role).agentName, sessionId: "session", toolArgs, toolName },
  output: { metadata: {}, toolArgs },
})
const blocked = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "_abort" in value

test("the setup manifest defines five unique, owned, deterministic agents", () => {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, "skills", "cycle", "setup", "manifest.json"), "utf8"),
  ) as {
    agents: { access: string; name: string; prompt: string; role: string }[]
    namespace: string
    owner: string
    schema: string
  }
  assert.equal(manifest.schema, SETUP_SCHEMA)
  assert.equal(manifest.namespace, SETUP_NAMESPACE)
  assert.equal(manifest.owner, SETUP_OWNER)
  assert.equal(manifest.agents.length, 5)
  assert.equal(new Set(manifest.agents.map((entry) => entry.name)).size, 5)
  assert.deepEqual(manifest.agents.map((entry) => entry.role), ROLE_SETUP.map((entry) => entry.role))
  assert.deepEqual(manifest.agents.map((entry) => entry.name), ROLE_SETUP.map((entry) => entry.agentName))
  assert.deepEqual(manifest.agents.map((entry) => entry.access), ROLE_SETUP.map((entry) => entry.access))
  for (const entry of manifest.agents) {
    assert.match(entry.name, /^cycle-v2-[a-z-]+$/u)
    assert.ok(["executor", "read_only"].includes(entry.access))
    assert.equal(entry.prompt.includes(".."), true)
    assert.ok(readFileSync(join(ROOT, "skills", "cycle", "setup", entry.prompt), "utf8").trim())
  }
})

test("setup assessment is create, update, noop, or conflict without taking over a user agent", () => {
  const role: CycleRole = "architect"
  const spec = roleSetup(role)
  const body = readFileSync(join(ROOT, spec.promptPath), "utf8")
  const systemPrompt = managedSystemPrompt(role, body)

  assert.equal(assessAgent(role, body, undefined).action, "create")
  assert.equal(assessAgent(role, body, {
    description: "user-owned",
    name: spec.agentName,
    systemPrompt: "not managed by Cycle",
  }).action, "conflict")
  assert.equal(assessAgent(role, body, {
    description: "stale",
    name: spec.agentName,
    systemPrompt,
  }).action, "update")
  assert.equal(assessAgent(role, body, {
    description: spec.description,
    name: spec.agentName,
    systemPrompt: systemPrompt.replaceAll("\n", "\r\n"),
  }).action, "noop")
  assert.equal(assessUninstall(role, {
    description: spec.description,
    name: spec.agentName,
    systemPrompt,
  }).action, "delete")
  assert.equal(assessUninstall(role, {
    description: "user-owned",
    name: spec.agentName,
    systemPrompt: ownershipMarker("executor"),
  }).action, "conflict")
})

test("read-only roles fail closed except for their explicit inspection capabilities", () => {
  for (const role of ["architect", "functional_reviewer", "security_reviewer", "arbiter"] as const) {
    assert.equal(decide(envelope("read", { filePath: "src/app.ts" }, role), role), null, role)
    assert.equal(decide(envelope("mcp__cycle-tools__cycle_graph_query", { operation: "symbol" }, role), role), null, role)
    assert.equal(blocked(decide(envelope("bash", { command: "git status" }, role), role)), true, role)
    assert.equal(blocked(decide(envelope("write", { filePath: "src/app.ts" }, role), role)), true, role)
    assert.equal(blocked(decide(envelope("task", { prompt: "delegate" }, role), role)), true, role)
    assert.equal(blocked(decide(envelope("unknown_future_tool", {}, role), role)), true, role)
  }
  assert.equal(
    blocked(decide(envelope("mcp__cycle-tools__cycle_workflow", { operation: "submit_browser_evidence" }, "functional_reviewer"), "functional_reviewer")),
    true,
  )
  assert.equal(
    blocked(decide(envelope("mcp__cycle-tools__cycle_workflow", { operation: "run_proof" }, "security_reviewer"), "security_reviewer")),
    true,
  )
  assert.equal(
    blocked(decide(envelope("mcp__cycle-tools__cycle_workflow", { operation: "deliver" }, "arbiter"), "arbiter")),
    true,
  )
})

test("the executor can work but cannot delegate, govern, touch .git, or mutate Git", () => {
  assert.equal(decide(envelope("write", { filePath: "src/app.ts" }), "executor"), null)
  assert.equal(decide(envelope("bash", { command: "npm test" }), "executor"), null)
  assert.equal(decide(envelope("bash", { command: "git status --short" }), "executor"), null)
  assert.equal(blocked(decide(envelope("bash", {}), "executor")), true)
  assert.equal(
    decide(envelope("bash", { command: '"C:/Program Files/Git/bin/git.exe" diff --stat' }), "executor"),
    null,
  )
  for (const command of [
    "git add -A",
    "git commit -m done",
    "cmd /c git checkout main",
    "git config core.hooksPath off",
    "git update-index --skip-worktree src/app.ts",
    "Remove-Item -Recurse .git",
  ]) {
    assert.equal(blocked(decide(envelope("bash", { command }), "executor")), true, command)
  }
  assert.equal(blocked(decide(envelope("edit", { filePath: ".git/config" }), "executor")), true)
  assert.equal(blocked(decide(envelope("task", { prompt: "delegate" }), "executor")), true)
  assert.equal(
    blocked(decide(envelope("mcp__cycle-tools__cycle_workflow", { operation: "deliver" }), "executor")),
    true,
  )
  assert.equal(
    blocked(decide({ ...envelope("read"), input: { ...envelope("read").input, agentName: "other" } }, "executor")),
    true,
  )
})

test("the installed script emits a Mavis _abort result and fails closed on malformed input", () => {
  const guard = join(ROOT, "skills", "cycle", "setup", "guard.mjs")
  const denied = spawnSync(process.execPath, [guard, "executor"], {
    encoding: "utf8",
    input: JSON.stringify(envelope("bash", { command: "git commit -m no" })),
  })
  assert.equal(denied.status, 0)
  assert.equal(blocked(JSON.parse(denied.stdout)), true)

  const malformed = spawnSync(process.execPath, [guard, "executor"], {
    encoding: "utf8",
    input: "not-json",
  })
  assert.equal(malformed.status, 0)
  assert.equal(blocked(JSON.parse(malformed.stdout)), true)
})

test("the hook template and sanitized setup receipt schema remain parseable", () => {
  const hook = readFileSync(
    join(ROOT, "skills", "cycle", "setup", "pre-tool-use.md.template"),
    "utf8",
  )
  assert.match(hook, /^---\nhookEvent: PreToolUse\ntype: script\npriority: 10\ntimeout: 10000\n---/u)
  assert.match(hook, /node "\{\{GUARD_PATH\}\}" "\{\{ROLE\}\}"/u)

  const receipt = JSON.parse(
    readFileSync(join(ROOT, "skills", "cycle", "setup", "receipt.schema.json"), "utf8"),
  ) as { properties: { status: { enum: string[] } } }
  assert.deepEqual(receipt.properties.status.enum, ["installed_unverified", "ready", "blocked", "uninstalled"])
})

test("managed role prompts use current schemas, measurable stops, and MiniMax field names", () => {
  for (const spec of ROLE_SETUP) {
    const prompt = readFileSync(join(ROOT, spec.promptPath), "utf8")
    assert.match(prompt, /## Boundaries/u, spec.role)
    assert.match(prompt, /## Stop when/u, spec.role)
    assert.doesNotMatch(prompt, /reject_with_repair|"decision": "approved\|repair|\/cycle:/u, spec.role)
  }
  const architect = readFileSync(join(ROOT, roleSetup("architect").promptPath), "utf8")
  for (const key of ["assumptions", "integration_checks", "requirements", "risks", "tasks"]) {
    assert.ok(architect.includes(`\`${key}\``), key)
  }
  const functional = readFileSync(join(ROOT, roleSetup("functional_reviewer").promptPath), "utf8")
  assert.match(functional, /"kind": "browser_capture"/u)
  assert.match(functional, /Never call Cycle control-plane operations yourself/u)
  const security = readFileSync(join(ROOT, roleSetup("security_reviewer").promptPath), "utf8")
  assert.match(security, /"kind": "proof_request"/u)
  assert.match(security, /"vulnerability_class"/u)
})

test("the natural-language setup is explicit, native-only, reversible, and honest about live hooks", () => {
  const procedure = readFileSync(join(ROOT, "skills", "cycle", "setup", "PROCEDURE.md"), "utf8")
  assert.match(procedure, /only after the user\s+explicitly asks/iu)
  assert.match(procedure, /native MiniMax `mavis` model tool/iu)
  assert.match(procedure, /Do not shell out to a `mavis` CLI/iu)
  assert.match(procedure, /If any assessment is `conflict`, stop before the first mutation/iu)
  assert.match(procedure, /installed_unverified/iu)
  assert.match(procedure, /preserve all durable Cycle data/iu)
  assert.match(procedure, /issues\/131/iu)
  assert.match(procedure, /issues\/124/iu)

  const modelsText = readFileSync(join(ROOT, "skills", "cycle", "config", "models.example.json"), "utf8")
  const models = JSON.parse(modelsText) as { roles: Record<string, string>; strategy: string }
  assert.equal(models.strategy, "session-inherited")
  assert.deepEqual(Object.keys(models.roles).sort(), ROLE_SETUP.map((entry) => entry.role).sort())
  assert.doesNotMatch(modelsText, /anthropic\/|openai\/|model:/iu)
})

test("setup receipts cannot claim ready, omit a role, or substitute an agent", () => {
  const agents = ROLE_SETUP.map((spec) => ({
    effectiveModel: "minimax/MiniMax-M3",
    hookDigest: "a".repeat(64),
    hookLiveVerified: false,
    hookOfflineVerified: true,
    modelSource: "session-inherited",
    name: spec.agentName,
    nativeVerified: true,
    role: spec.role,
  }))
  const installed = {
    agents,
    pluginVersion: "2.0.0-alpha.7",
    profile: "cycle-t04",
    schema: "cycle.mavis-setup-receipt.v1",
    status: "installed_unverified",
  }
  assert.equal(validateSetupReceipt(installed, "2.0.0-alpha.7").status, "installed_unverified")
  assert.throws(
    () => validateSetupReceipt({ ...installed, status: "ready" }, "2.0.0-alpha.7"),
    /ready requires/u,
  )
  assert.throws(
    () => validateSetupReceipt({ ...installed, agents: agents.slice(0, 4) }, "2.0.0-alpha.7"),
    /exactly five/u,
  )
  assert.throws(
    () => validateSetupReceipt({
      ...installed,
      agents: agents.map((entry, index) => index === 1 ? { ...entry, name: "user-executor" } : entry),
    }, "2.0.0-alpha.7"),
    /role\/name mismatch/u,
  )
})

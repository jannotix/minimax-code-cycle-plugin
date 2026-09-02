import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  assessAgent,
  assessUninstall,
  managedAgentMarkdown,
  managedSystemPrompt,
  ownershipMarker,
  profileRelativePath,
  ROLE_SETUP,
  roleSetup,
  roleAllowsTool,
  SETUP_NAMESPACE,
  SETUP_OWNER,
  SETUP_SCHEMA,
  validateSetupReceipt,
  type CycleRole,
} from "../src/setup.ts"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
test("the setup manifest defines five unique, owned, deterministic agents", () => {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, "skills", "cycle", "setup", "manifest.json"), "utf8"),
  ) as {
    agents: { access: string; mcpServers: string[]; name: string; prompt: string; role: string; skills: string[]; tools: string[] }[]
    mcp: { argsFromPluginRoot: string[]; command: string; name: string; ownerArgument: string; transport: string }
    namespace: string
    owner: string
    schema: string
  }
  assert.equal(manifest.schema, SETUP_SCHEMA)
  assert.equal(manifest.namespace, SETUP_NAMESPACE)
  assert.equal(manifest.owner, SETUP_OWNER)
  assert.deepEqual(manifest.mcp, {
    argsFromPluginRoot: ["dist/server.js"],
    command: "node",
    name: "cycle-tools",
    ownerArgument: "--cycle-managed=minimax-code-cycle-plugin",
    transport: "stdio",
  })
  assert.equal(manifest.agents.length, 5)
  assert.equal(new Set(manifest.agents.map((entry) => entry.name)).size, 5)
  assert.deepEqual(manifest.agents.map((entry) => entry.role), ROLE_SETUP.map((entry) => entry.role))
  assert.deepEqual(manifest.agents.map((entry) => entry.name), ROLE_SETUP.map((entry) => entry.agentName))
  assert.deepEqual(manifest.agents.map((entry) => entry.access), ROLE_SETUP.map((entry) => entry.access))
  assert.deepEqual(
    ROLE_SETUP.map((entry) => profileRelativePath(entry.role)),
    ROLE_SETUP.map((entry) => `agents/${entry.agentName}/agent.md`),
  )
  for (const entry of manifest.agents) {
    assert.match(entry.name, /^cycle-v2-[a-z-]+$/u)
    assert.ok(["executor", "read_only"].includes(entry.access))
    assert.ok(entry.tools.length >= 3)
    assert.deepEqual(entry.mcpServers, [])
    assert.deepEqual(entry.skills, [])
    assert.equal(entry.prompt.includes(".."), true)
    assert.ok(readFileSync(join(ROOT, "skills", "cycle", "setup", entry.prompt), "utf8").trim())
  }
})

test("setup assessment is create, update, noop, or conflict without taking over a user agent", () => {
  const role: CycleRole = "architect"
  const spec = roleSetup(role)
  const body = readFileSync(join(ROOT, spec.promptPath), "utf8")
  const systemPrompt = managedSystemPrompt(role, body)
  const profile = managedAgentMarkdown(role, body)

  assert.equal(assessAgent(role, body, undefined).action, "create")
  assert.equal(assessAgent(role, body, {
    description: "user-owned",
    name: spec.agentName,
    systemPrompt: "not managed by Cycle",
  }).action, "conflict")
  const stale = assessAgent(role, body, {
    description: "stale",
    name: spec.agentName,
    systemPrompt,
  })
  assert.equal(stale.action, "update")
  assert.match(stale.reason, /rewrite agent\.md and do not update system_prompt/u)
  assert.equal(assessAgent(role, body, {
    description: spec.description,
    name: spec.agentName,
    systemPrompt: systemPrompt.replaceAll("\n", "\r\n"),
  }, profile.replaceAll("\n", "\r\n")).action, "noop")
  assert.equal(assessAgent(role, body, {
    description: spec.description,
    name: spec.agentName,
    systemPrompt,
  }, "---\nname: foreign\n---\nnot managed").action, "conflict")
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
    assert.equal(roleAllowsTool(role, "read"), true, role)
    assert.equal(roleAllowsTool(role, "grep"), true, role)
    assert.equal(roleAllowsTool(role, "glob"), true, role)
    for (const denied of ["bash", "write", "edit", "task", "mavis", "memory", "mcp__cycle-tools__cycle_workflow", "unknown_future_tool"]) {
      assert.equal(roleAllowsTool(role, denied), false, `${role}:${denied}`)
    }
  }
})

test("the executor allowlist excludes shell, delegation, governance, and future tools", () => {
  for (const allowed of ["read", "write", "edit", "grep", "glob"]) {
    assert.equal(roleAllowsTool("executor", allowed), true, allowed)
  }
  for (const denied of ["bash", "task", "task_append", "mavis", "memory", "website_deploy", "mcp__cycle-tools__cycle_workflow", "unknown_future_tool"]) {
    assert.equal(roleAllowsTool("executor", denied), false, denied)
  }
})

test("canonical agent profiles carry exact fail-closed selectors", () => {
  for (const spec of ROLE_SETUP) {
    const body = readFileSync(join(ROOT, spec.promptPath), "utf8")
    const profile = managedAgentMarkdown(spec.role, body)
    assert.match(profile, new RegExp(`^---\\nname: ${spec.agentName}\\n`, "u"))
    assert.match(profile, /\nmcpServers: \[\]\nskills: \[\]\n/u)
    assert.doesNotMatch(profile, /\n  - (?:bash|task|mavis|memory)\n/u)
    assert.match(profile, new RegExp(ownershipMarker(spec.role), "u"))
  }
})

test("the capability manifest and sanitized setup receipt schema remain parseable", () => {
  const receipt = JSON.parse(
    readFileSync(join(ROOT, "skills", "cycle", "setup", "receipt.schema.json"), "utf8"),
  ) as { properties: { schema: { const: string }; status: { enum: string[] } } }
  assert.equal(receipt.properties.schema.const, "cycle.mavis-setup-receipt.v2")
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

test("the natural-language setup is explicit, native-only, reversible, and honest about live profiles", () => {
  const procedure = readFileSync(join(ROOT, "skills", "cycle", "setup", "PROCEDURE.md"), "utf8")
  assert.match(procedure, /only after the user\s+explicitly asks/iu)
  assert.match(procedure, /Call native `mavis`/iu)
  assert.match(procedure, /Do not use a shell `mavis` CLI/iu)
  assert.match(procedure, /If any agent or MCP collision is foreign, stop before the first mutation/iu)
  assert.match(procedure, /canonical `agent\.md`/iu)
  assert.match(procedure, /installed_unverified/iu)
  assert.match(procedure, /preserve all durable Cycle data/iu)
  assert.match(procedure, /issues\/124/iu)
  assert.match(procedure, /manual editor/iu)
  assert.doesNotMatch(procedure, /Upload a skill/iu)
  assert.match(procedure, /mcp create/iu)
  assert.match(procedure, /setup request must include an explicit,\s+absolute `profile_root`/iu)
  assert.match(procedure, /profileRelativePath/iu)
  assert.match(procedure, /Do not use Terminal, a shell, or directory discovery/iu)
  assert.match(procedure, /ownerArgument/iu)
  assert.match(procedure, /drops `description` and `env` fields/iu)
  assert.match(procedure, /dataDirectorySource: "minimax_data_dir"/iu)
  assert.doesNotMatch(procedure, /description containing `cycle-managed:minimax-code-cycle-plugin`/iu)
  assert.match(procedure, /canonical `agent\.md` is the only authority/iu)
  assert.match(procedure, /Never call native `agent update`\s+with `system_prompt`/iu)
  const profileTarget = procedure.indexOf("only permitted profile target")
  const profileWrite = procedure.indexOf("with the complete returned `profile` bytes")
  const nativeReadBack = procedure.indexOf("then call `agent get` and")
  const noopAssessment = procedure.indexOf("The result must be `noop`")
  assert.ok(profileTarget >= 0)
  assert.ok(profileWrite >= 0)
  assert.ok(profileWrite > profileTarget, "the canonical target must be formed before it is written")
  assert.ok(nativeReadBack > profileWrite, "canonical agent.md must be read back through native agent get")
  assert.ok(noopAssessment > nativeReadBack, "read-back must be assessed before setup can continue")
  assert.doesNotMatch(procedure, /native `agent update` sets the exact managed `system_prompt`/iu)

  const modelsText = readFileSync(join(ROOT, "skills", "cycle", "config", "models.example.json"), "utf8")
  const models = JSON.parse(modelsText) as { roles: Record<string, string>; strategy: string }
  assert.equal(models.strategy, "session-inherited")
  assert.deepEqual(Object.keys(models.roles).sort(), ROLE_SETUP.map((entry) => entry.role).sort())
  assert.doesNotMatch(modelsText, /anthropic\/|openai\/|model:/iu)
})

test("setup receipts cannot claim ready, omit a role, or substitute an agent", () => {
  const agents = ROLE_SETUP.map((spec) => ({
    configDigest: "a".repeat(64),
    configLiveVerified: false,
    configOfflineVerified: true,
    effectiveModel: "minimax/MiniMax-M3",
    modelSource: "session-inherited",
    name: spec.agentName,
    nativeVerified: true,
    role: spec.role,
  }))
  const installed = {
    agents,
    pluginVersion: "2.0.0-alpha.13",
    profile: "cycle-t04",
    schema: "cycle.mavis-setup-receipt.v2",
    status: "installed_unverified",
  }
  assert.equal(validateSetupReceipt(installed, "2.0.0-alpha.13").status, "installed_unverified")
  assert.throws(
    () => validateSetupReceipt({ ...installed, status: "ready" }, "2.0.0-alpha.13"),
    /ready requires/u,
  )
  assert.throws(
    () => validateSetupReceipt({ ...installed, agents: agents.slice(0, 4) }, "2.0.0-alpha.13"),
    /exactly five/u,
  )
  assert.throws(
    () => validateSetupReceipt({
      ...installed,
      agents: agents.map((entry, index) => index === 1 ? { ...entry, name: "user-executor" } : entry),
    }, "2.0.0-alpha.13"),
    /role\/name mismatch/u,
  )
})

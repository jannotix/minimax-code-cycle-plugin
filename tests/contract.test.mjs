import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "2.0.0-alpha.8";

async function text(path) {
  return await readFile(join(ROOT, path), "utf8");
}

function run(program, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code, signal) => resolveResult({ code, signal, stderr, stdout }));
  });
}

function mcpExchange(messages) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [join(ROOT, "dist", "server.js")], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses = [];
    let buffer = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("MCP contract probe timed out"));
    }, 5_000);

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) responses.push(JSON.parse(line));
      if (responses.length === messages.length) {
        clearTimeout(timeout);
        child.stdin.end();
        resolveResult(responses);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

test("every active version surface identifies the same alpha", async () => {
  const packageJson = JSON.parse(await text("package.json"));
  const packageLock = JSON.parse(await text("package-lock.json"));
  const pluginJson = JSON.parse(await text("plugin.json"));
  const server = await text("src/version.ts");

  assert.equal(packageJson.version, VERSION);
  assert.equal(packageLock.version, VERSION);
  assert.equal(packageLock.packages[""].version, VERSION);
  assert.equal(pluginJson.version, VERSION);
  assert.match(server, new RegExp(`VERSION = ${JSON.stringify(VERSION)}`));
  assert.equal(packageJson.license, "FSL-1.1-MIT");
  assert.equal(pluginJson.license, "FSL-1.1-MIT");
});

test("the public contract does not advertise unsupported commands or marketplace publication", async () => {
  const readme = await text("README.md");
  const skill = await text("skills/cycle/SKILL.md");
  const commandToken =
    /(^|[\s`])\/cycle(?::|[ \t]+(?:setup|doctor|run|plan|execute|review|arbitrate|status|tasks|evidence|pause|cancel|retry|history|memory|models|permissions|limits|export|help))/mu;

  for (const publicText of [readme, skill]) {
    assert.doesNotMatch(publicText, commandToken);
    assert.doesNotMatch(publicText, /publishes? to the official Plugin Marketplace/iu);
  }
  assert.match(readme, /production release is blocked/iu);
  assert.match(skill, /not production-ready/iu);
});

test("unsupported graph operations fail explicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-minimax-contract-"));
  try {
    const graph = join(root, ".cycle", "graph");
    await mkdir(graph, { recursive: true });
    await writeFile(
      join(graph, "manifest.json"),
      JSON.stringify({ schema: "cycle.graph.manifest.v1", files: [] }),
      "utf8",
    );

    const unsupported = await run(process.execPath, [
      join(ROOT, "scripts", "graph-query.mjs"),
      root,
      "callers",
      "--name",
      "main",
    ]);
    assert.equal(unsupported.code, 1);
    assert.match(unsupported.stderr, /not implemented in 2\.0\.0-alpha\.6/u);

    const since = await run(process.execPath, [
      join(ROOT, "scripts", "graph-query.mjs"),
      root,
      "declarations",
      "--since",
      "1",
    ]);
    assert.equal(since.code, 1);
    assert.match(since.stderr, /--since is not implemented/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("the malformed legacy packager fails closed", async () => {
  const result = await run(process.execPath, [join(ROOT, "scripts", "package-skill.mjs")]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /disabled during the 2\.0\.0 production rebuild/u);
});

test("the Agent Plugin manifests remain parseable and expose only the portable component roots", async () => {
  const packageJson = JSON.parse(await text("package.json"));
  const pluginJson = JSON.parse(await text("plugin.json"));
  const mcpJson = JSON.parse(await text("mcp.json"));
  const allowedPluginFields = new Set([
    "$schema",
    "name",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
    "extensions",
  ]);

  assert.equal(pluginJson.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.ok(Object.keys(pluginJson).every((key) => allowedPluginFields.has(key)));
  assert.equal(mcpJson.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
  assert.deepEqual(Object.keys(mcpJson.mcpServers), ["cycle-tools"]);
  assert.deepEqual(mcpJson.mcpServers["cycle-tools"], {
    args: ["./dist/server.js"],
    command: "node",
    type: "stdio",
  });
  assert.equal(packageJson.dependencies, undefined);
  for (const lifecycle of ["preinstall", "install", "postinstall"]) {
    assert.equal(packageJson.scripts[lifecycle], undefined, `${lifecycle} must not mutate a profile`);
  }
  assert.equal(packageJson.scripts["graph-index"], undefined);
  assert.equal(packageJson.scripts["graph-query"], undefined);
  assert.match(await text("dist/server.js"), /cycle-control-plane-minimax/u);

  const skill = await text("skills/cycle/SKILL.md");
  const description = skill.match(/^description:\s*(.+)$/mu)?.[1]?.trim();
  const compatibility = skill.match(/^compatibility:\s*(.+)$/mu)?.[1]?.trim();
  assert.equal(skill.match(/^name:\s*(.+)$/mu)?.[1]?.trim(), "cycle");
  assert.ok(description && description.length <= 1_024);
  assert.ok(compatibility && compatibility.length <= 500);
  for (const reference of [
    "coordinator/FLOW.md",
    "coordinator/ROLE_DISPATCH.md",
    "coordinator/RECOVERY.md",
    "setup/PROCEDURE.md",
  ]) {
    assert.match(skill, new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok((await text(`skills/cycle/${reference}`)).trim());
  }
});

test("the MCP handshake reports the alpha and only the implemented graph queries", async () => {
  const [initialized, listed] = await mcpExchange([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "contract-test", version: "1" },
      },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]);

  assert.equal(initialized.result.serverInfo.version, VERSION);
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "cycle_doctor",
    "cycle_setup",
    "cycle_coordinator",
    "cycle_workflow",
    "cycle_history",
    "cycle_limits",
    "cycle_verify_audit",
    "cycle_freeze_candidate",
    "cycle_graph_index",
    "cycle_graph_query",
    "cycle_memory",
    "cycle_goal",
  ]);
  const graph = listed.result.tools.find((tool) => tool.name === "cycle_graph_query");
  assert.deepEqual(graph.inputSchema.properties.operation.enum, [
    "status",
    "symbol",
    "neighbours",
    "impact",
    "scope",
  ]);
  assert.equal(graph.inputSchema.properties.query, undefined);
  assert.equal(graph.inputSchema.properties.since, undefined);
  const memory = listed.result.tools.find((tool) => tool.name === "cycle_memory");
  assert.deepEqual(memory.inputSchema.properties.operation.enum, ["search", "explain", "chain", "forget"]);
  const goal = listed.result.tools.find((tool) => tool.name === "cycle_goal");
  assert.ok(goal.inputSchema.properties.operation.enum.includes("approve"));
  const setup = listed.result.tools.find((tool) => tool.name === "cycle_setup");
  assert.deepEqual(setup.inputSchema.properties.operation.enum, ["spec", "assess", "uninstall", "validate_receipt"]);
  assert.equal(setup.inputSchema.properties.project_root, undefined);
  const coordinator = listed.result.tools.find((tool) => tool.name === "cycle_coordinator");
  assert.deepEqual(coordinator.inputSchema.required, [
    "operation",
    "project_root",
    "workflow_id",
    "setup_receipt",
    "native_mavis",
    "native_task",
    "browser",
  ]);
  const workflow = listed.result.tools.find((tool) => tool.name === "cycle_workflow");
  assert.ok(workflow.inputSchema.properties.operation.enum.includes("bind_role_session"));
  assert.ok(workflow.inputSchema.properties.operation.enum.includes("freeze_candidate"));
  assert.ok(workflow.inputSchema.properties.operation.enum.includes("verify"));
  assert.ok(workflow.inputSchema.properties.operation.enum.includes("arbitrate"));
  assert.ok(workflow.inputSchema.properties.operation.enum.includes("deliver"));
  assert.ok(workflow.inputSchema.properties.operation.enum.includes("reconcile"));
});

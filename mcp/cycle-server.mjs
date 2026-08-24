#!/usr/bin/env node
// MCP stdio server for the Cycle plugin. Speaks JSON-RPC 2.0 over
// stdin/stdout, one message per line. Wraps the scripts under
// ../scripts and exposes them as MCP tools.
//
// Tools:
//   - cycle_verify_audit(path)            verify a .cycle/audit.jsonl
//   - cycle_freeze_candidate(root, base)  freeze a candidate manifest
//   - cycle_graph_index(root)             build the AST knowledge graph
//   - cycle_graph_query(root, query)       run a scoped graph query
//
// Logs are written to stderr; only JSON-RPC messages go to stdout.

import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = resolve(HERE, "..", "scripts");
const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "cycle-tools";
const SERVER_VERSION = "1.0.0";

const TOOLS = [
  {
    name: "cycle_verify_audit",
    description:
      "Verify a Cycle audit JSONL ledger by recomputing the SHA-256 " +
      "hash chain. Returns a text summary. Exits non-zero on any break " +
      "in the chain (reported as an MCP error).",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or project-relative path to the audit JSONL file.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "cycle_freeze_candidate",
    description:
      "Freeze a candidate from a worktree at a given git base revision. " +
      "Produces a cycle.candidate.v1 manifest under .cycle/candidates/<id>/ " +
      "and returns the manifest JSON.",
    inputSchema: {
      type: "object",
      properties: {
        project_root: {
          type: "string",
          description: "Absolute path to the project root (must be a git worktree).",
        },
        base_revision: {
          type: "string",
          description: "Git revision (commit, tag, or branch) to diff against.",
        },
        out_dir: {
          type: "string",
          description: "Optional. Override the output directory for the manifest.",
        },
      },
      required: ["project_root", "base_revision"],
    },
  },
  {
    name: "cycle_graph_index",
    description:
      "Build or update the Cycle AST knowledge graph for a project. " +
      "Deterministic, incremental, content-addressed. Outputs the index " +
      "manifest to .cycle/graph/manifest.json.",
    inputSchema: {
      type: "object",
      properties: {
        project_root: {
          type: "string",
          description: "Absolute path to the project root.",
        },
        workers: {
          type: "number",
          description: "Optional. Number of parser workers. Defaults to CPU count.",
        },
        languages: {
          type: "string",
          description:
            "Optional. Comma-separated file extensions to index, e.g. '.ts,.tsx,.md'.",
        },
      },
      required: ["project_root"],
    },
  },
  {
    name: "cycle_graph_query",
    description:
      "Run a scoped query against the Cycle graph index. Returns one " +
      "JSON object per line. Query kinds: declarations, signature, imports, " +
      "importers, dependents, callers, callees, types, path.",
    inputSchema: {
      type: "object",
      properties: {
        project_root: {
          type: "string",
          description: "Absolute path to the project root.",
        },
        query: {
          type: "string",
          description: "One of: declarations, signature, imports, importers, dependents, callers, callees, types, path.",
        },
        name: { type: "string", description: "Optional. Glob for the declaration name." },
        kind: { type: "string", description: "Optional. Comma-separated kinds to include." },
        path: { type: "string", description: "Optional. Glob for the file path." },
        limit: { type: "number", description: "Optional. Max results (default 200, hard 10000)." },
        since: { type: "number", description: "Optional. Restrict to files changed in the last N hours." },
      },
      required: ["project_root", "query"],
    },
  },
];

function runScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [join(SCRIPTS_DIR, scriptName), ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    proc.on("error", (err) => reject(new Error(`spawn ${scriptName}: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `${scriptName} exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
          ),
        );
    });
  });
}

function freezeCandidate(root, base, outDir) {
  const args = [root, "--base", base];
  if (outDir !== undefined && outDir !== null && outDir !== "") {
    args.push("--out", outDir);
  }
  return runScript("freeze-candidate.mjs", args);
}

function graphIndex(root, workers, languages) {
  const args = [root];
  if (Number.isInteger(workers) && workers > 0) {
    args.push("--workers", String(workers));
  }
  if (typeof languages === "string" && languages.trim().length > 0) {
    args.push("--languages", languages);
  }
  return runScript("graph-index.mjs", args);
}

function graphQuery(root, query, filters) {
  const args = [root, query];
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    args.push(`--${key}`, String(value));
  }
  return runScript("graph-query.mjs", args);
}

async function callTool(name, args) {
  switch (name) {
    case "cycle_verify_audit": {
      if (typeof args.path !== "string" || args.path.length === 0) {
        throw new Error("cycle_verify_audit: 'path' is required");
      }
      const { stdout } = await runScript("verify-audit.mjs", [args.path]);
      return { content: [{ type: "text", text: stdout }] };
    }
    case "cycle_freeze_candidate": {
      if (typeof args.project_root !== "string" || args.project_root.length === 0) {
        throw new Error("cycle_freeze_candidate: 'project_root' is required");
      }
      if (typeof args.base_revision !== "string" || args.base_revision.length === 0) {
        throw new Error("cycle_freeze_candidate: 'base_revision' is required");
      }
      const { stdout } = await freezeCandidate(
        args.project_root,
        args.base_revision,
        args.out_dir,
      );
      return { content: [{ type: "text", text: stdout }] };
    }
    case "cycle_graph_index": {
      if (typeof args.project_root !== "string" || args.project_root.length === 0) {
        throw new Error("cycle_graph_index: 'project_root' is required");
      }
      const { stdout } = await graphIndex(
        args.project_root,
        args.workers,
        args.languages,
      );
      return { content: [{ type: "text", text: stdout }] };
    }
    case "cycle_graph_query": {
      if (typeof args.project_root !== "string" || args.project_root.length === 0) {
        throw new Error("cycle_graph_query: 'project_root' is required");
      }
      if (typeof args.query !== "string" || args.query.length === 0) {
        throw new Error("cycle_graph_query: 'query' is required");
      }
      const filters = {
        name: args.name,
        kind: args.kind,
        path: args.path,
        limit: args.limit,
        since: args.since,
      };
      const { stdout, stderr } = await graphQuery(args.project_root, args.query, filters);
      const text = stdout.length > 0 ? stdout : stderr;
      return { content: [{ type: "text", text: text.length > 0 ? text : "(no results)" }] };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

const SUPPORTED_METHODS = new Set(["initialize", "tools/list", "tools/call", "notifications/initialized"]);

function sendMessage(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function sendResult(id, result) {
  if (id === undefined || id === null) return;
  sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
  if (id === undefined || id === null) return;
  const error = { code, message };
  if (data !== undefined) error.data = data;
  sendMessage({ jsonrpc: "2.0", id, error });
}

async function handleMessage(message) {
  const { id, method, params } = message;
  if (typeof method !== "string" || !SUPPORTED_METHODS.has(method)) {
    sendError(id, -32601, `Method not found: ${method}`);
    return;
  }
  if (method === "notifications/initialized") {
    return;
  }
  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (method === "tools/list") {
    sendResult(id, { tools: TOOLS });
    return;
  }
  if (method === "tools/call") {
    if (params === null || typeof params !== "object") {
      sendError(id, -32602, "tools/call: 'params' must be an object");
      return;
    }
    const { name, arguments: toolArgs } = params;
    if (typeof name !== "string") {
      sendError(id, -32602, "tools/call: 'name' is required and must be a string");
      return;
    }
    try {
      const result = await callTool(name, toolArgs ?? {});
      sendResult(id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(id, -32603, message);
    }
    return;
  }
}

process.stderr.write(`${SERVER_NAME} ${SERVER_VERSION} ready (protocol ${PROTOCOL_VERSION})\n`);

const rl = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (line.length === 0) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (err) {
    process.stderr.write(`parse error: ${err.message}\n`);
    return;
  }
  if (typeof message !== "object" || message === null) return;
  handleMessage(message).catch((err) => {
    process.stderr.write(`handler error: ${err.stack ?? err.message}\n`);
    sendError(message.id, -32603, err.message ?? "internal error");
  });
});

rl.on("close", () => {
  process.exit(0);
});

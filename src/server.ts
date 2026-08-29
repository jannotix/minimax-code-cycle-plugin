#!/usr/bin/env node

import { spawn } from "node:child_process"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { release } from "./admission.ts"
import { diagnose } from "./diagnostics.ts"
import { serve, type ToolDefinition } from "./mcp.ts"
import { Runtime } from "./runtime.ts"
import { signCheckpoint, verifyCheckpoints } from "./store/checkpoints.ts"
import { readHistory, verifyHistory } from "./store/history.ts"
import {
  amendWorkflow,
  arbitrateWorkflow,
  candidateEvidence,
  controlWorkflow,
  deliverWorkflowCandidate,
  freezeWorkflowCandidate,
  reconcileWorkflow,
  reportTask,
  requireProjectWorkflow,
  startWorkflow,
  submitBrowserEvidence,
  submitPlan,
  submitReviewVerdict,
  submitSecurityProof,
  verifyWorkflowCandidate,
  workflowStatus,
} from "./workflow/service.ts"
import type { Preference } from "./workflow/routing.ts"
import { VERSION } from "./version.ts"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SCRIPTS = join(ROOT, "scripts")
const runtime = new Runtime()

const tools: readonly ToolDefinition[] = [
  {
    name: "cycle_doctor",
    description:
      "Inspect the MiniMax Cycle control-plane runtime, explicit project identity, store schema, " +
      "history chain, signed checkpoints, key permissions, and configuration.",
    inputSchema: objectSchema({ project_root: stringSchema("Absolute project directory.") }, [
      "project_root",
    ]),
    run: async (args) => await diagnose(runtime, projectRoot(args), VERSION),
  },
  {
    name: "cycle_workflow",
    description:
      "Drive a durable evidence-gated workflow through planning, scoped execution reports, exact " +
      "candidate freeze, verification, reviews, arbitration, delivery, recovery, and controls. " +
      "Only state-machine-legal transitions are accepted.",
    inputSchema: objectSchema(
      {
        operation: enumSchema([
          "start",
          "status",
          "amend",
          "control",
          "submit_plan",
          "report_task",
          "freeze_candidate",
          "verify",
          "evidence",
          "submit_review",
          "submit_browser_evidence",
          "run_proof",
          "arbitrate",
          "deliver",
          "reconcile",
        ]),
        project_root: stringSchema("Absolute project directory."),
        workflow_id: stringSchema("Workflow identifier for non-start operations."),
        request: stringSchema("Exact original user request for start."),
        preference: enumSchema(["auto", "full", "quick"]),
        affected_paths: arraySchema("Known project-relative paths for routing."),
        amendment: stringSchema("Exact user amendment."),
        control_operation: enumSchema(["pause", "resume", "retry", "cancel"]),
        confirm: { type: "boolean" },
        additional_cycles: { minimum: 1, type: "integer" },
        reason: stringSchema("Optional pause or cancellation reason."),
        plan: { type: "object" },
        task_key: stringSchema("Plan task key."),
        task_status: enumSchema(["blocked", "completed", "plan_defect"]),
        summary: stringSchema("Bounded executor task summary."),
        role: enumSchema(["functional_reviewer", "security_reviewer"]),
        verdict: { type: "object" },
        snapshot: { type: "object" },
        capture_token: stringSchema("One-use reviewer capture capability."),
        vulnerability_class: stringSchema("Stable vulnerability class."),
        rationale: stringSchema("Why the proof may demonstrate the vulnerability."),
        interpreter: stringSchema("Interpreter for an inline proof script."),
        script: stringSchema("Inline proof source."),
        command: stringSchema("Safe proof command when no inline script is supplied."),
      },
      ["operation", "project_root"],
    ),
    run: async (args) => await workflowOperation(args),
  },
  {
    name: "cycle_history",
    description:
      "List project-scoped history, verify the global append-only chain and checkpoints, or sign " +
      "the current chain head with the local Ed25519 key.",
    inputSchema: objectSchema(
      {
        operation: enumSchema(["list", "verify", "checkpoint"]),
        project_root: stringSchema("Absolute project directory."),
        after_sequence: { minimum: -1, type: "integer" },
        limit: { maximum: 1000, minimum: 1, type: "integer" },
      },
      ["operation", "project_root"],
    ),
    run: (args) => historyOperation(args),
  },
  {
    name: "cycle_limits",
    description:
      "Inspect measured resource pressure and lease limits, or admit, renew, and release a " +
      "workflow without blocking the MCP process.",
    inputSchema: objectSchema(
      {
        operation: enumSchema(["status", "admit", "renew", "release"]),
        project_root: stringSchema("Absolute project directory."),
        workflow_id: stringSchema("Workflow identifier for lease mutation."),
      },
      ["operation", "project_root"],
    ),
    run: async (args) => await limitsOperation(args),
  },
  {
    name: "cycle_verify_audit",
    description:
      "Check the internal sequence and SHA-256 links of a legacy Cycle JSONL ledger contained " +
      "inside project_root. This does not authenticate origin.",
    inputSchema: objectSchema(
      {
        project_root: stringSchema("Absolute project directory."),
        path: stringSchema("Project-relative or contained absolute ledger path."),
      },
      ["project_root", "path"],
    ),
    run: async (args) => {
      const root = projectRoot(args)
      const path = contained(root, requiredString(args, "path"))
      const result = await runScript("verify-audit.mjs", [path], 30_000)
      return { summary: result.stdout.trim() }
    },
  },
  {
    name: "cycle_freeze_candidate",
    description:
      "Produce the legacy diagnostic manifest for base_revision..HEAD. This is not an immutable " +
      "production freeze and cannot authorize delivery.",
    inputSchema: objectSchema(
      {
        project_root: stringSchema("Absolute project directory."),
        base_revision: stringSchema("Git revision to compare with HEAD."),
      },
      ["project_root", "base_revision"],
    ),
    run: async (args) => {
      const result = await runScript(
        "freeze-candidate.mjs",
        [projectRoot(args), "--base", requiredString(args, "base_revision")],
        30_000,
      )
      return JSON.parse(result.stdout) as unknown
    },
  },
  {
    name: "cycle_graph_index",
    description:
      "Build the alpha's lightweight full-rebuild regular-expression structural index in an " +
      "explicit project root.",
    inputSchema: objectSchema(
      {
        project_root: stringSchema("Absolute project directory."),
        workers: { minimum: 1, type: "integer" },
        languages: stringSchema("Comma-separated extensions, for example .ts,.tsx,.md."),
      },
      ["project_root"],
    ),
    run: async (args) => {
      const scriptArgs = [projectRoot(args)]
      const workers = boundedInteger(args, "workers", 1, 256)
      if (workers !== undefined) scriptArgs.push("--workers", String(workers))
      const languages = optionalString(args, "languages")
      if (languages !== undefined) scriptArgs.push("--languages", languages)
      const result = await runScript("graph-index.mjs", scriptArgs, 300_000)
      return { summary: result.stdout.trim() }
    },
  },
  {
    name: "cycle_graph_query",
    description:
      "Query the alpha structural index. Implemented kinds: declarations, signature, imports, " +
      "importers, dependents, and types.",
    inputSchema: objectSchema(
      {
        project_root: stringSchema("Absolute project directory."),
        query: enumSchema([
          "declarations",
          "signature",
          "imports",
          "importers",
          "dependents",
          "types",
        ]),
        name: stringSchema("Optional name glob."),
        kind: stringSchema("Optional comma-separated declaration kinds."),
        path: stringSchema("Optional project-relative path glob."),
        limit: { maximum: 10000, minimum: 1, type: "integer" },
      },
      ["project_root", "query"],
    ),
    run: async (args) => {
      const scriptArgs = [projectRoot(args), requiredString(args, "query")]
      for (const key of ["name", "kind", "path"] as const) {
        const value = optionalString(args, key)
        if (value !== undefined) scriptArgs.push(`--${key}`, value)
      }
      const limit = boundedInteger(args, "limit", 1, 10000)
      if (limit !== undefined) scriptArgs.push("--limit", String(limit))
      const result = await runScript("graph-query.mjs", scriptArgs, 10_000)
      return {
        results: result.stdout
          .split(/\r?\n/u)
          .filter(Boolean)
          .map((line) => JSON.parse(line) as unknown),
        warning: result.stderr.trim() || null,
      }
    },
  },
]

serve({ name: "cycle-control-plane-minimax", version: VERSION }, tools)

process.on("exit", () => runtime.close())

async function workflowOperation(args: Record<string, unknown>): Promise<unknown> {
  const operation = requiredString(args, "operation")
  const root = projectRoot(args)
  switch (operation) {
    case "start":
      return startWorkflow(runtime, {
        affectedPaths: optionalStrings(args, "affected_paths"),
        preference: (optionalString(args, "preference") ?? "auto") as Preference,
        projectRoot: root,
        request: requiredString(args, "request"),
      })
    case "status":
      return workflowStatus(runtime, root, optionalString(args, "workflow_id"))
    case "amend":
      return amendWorkflow(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        requiredString(args, "amendment"),
      )
    case "control": {
      const additionalCycles = boundedInteger(args, "additional_cycles", 1, 20)
      const reason = optionalString(args, "reason")
      return controlWorkflow(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        oneOf(args, "control_operation", ["pause", "resume", "retry", "cancel"]),
        {
          ...(additionalCycles === undefined ? {} : { additionalCycles }),
          confirm: args["confirm"] === true,
          ...(reason === undefined ? {} : { reason }),
        },
      )
    }
    case "submit_plan":
      return submitPlan(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        requiredRecord(args, "plan"),
      )
    case "report_task":
      return await reportTask(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        requiredString(args, "task_key"),
        oneOf(args, "task_status", ["blocked", "completed", "plan_defect"]),
        requiredString(args, "summary"),
      )
    case "freeze_candidate":
      return await freezeWorkflowCandidate(runtime, root, requiredString(args, "workflow_id"))
    case "verify":
      return await verifyWorkflowCandidate(runtime, root, requiredString(args, "workflow_id"))
    case "evidence":
      return candidateEvidence(runtime, root, requiredString(args, "workflow_id"))
    case "submit_review":
      return submitReviewVerdict(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        oneOf(args, "role", ["functional_reviewer", "security_reviewer"]),
        requiredRecord(args, "verdict"),
      )
    case "submit_browser_evidence":
      return submitBrowserEvidence(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        requiredRecord(args, "snapshot"),
        optionalString(args, "capture_token") ?? null,
      )
    case "run_proof": {
      const command = optionalString(args, "command")
      const interpreter = optionalString(args, "interpreter")
      const script = optionalString(args, "script")
      return await submitSecurityProof(runtime, root, requiredString(args, "workflow_id"), {
        ...(command === undefined ? {} : { command }),
        ...(interpreter === undefined ? {} : { interpreter }),
        rationale: requiredString(args, "rationale"),
        ...(script === undefined ? {} : { script }),
        vulnerabilityClass: requiredString(args, "vulnerability_class"),
      })
    }
    case "arbitrate":
      return arbitrateWorkflow(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        requiredRecord(args, "verdict"),
      )
    case "deliver":
      return await deliverWorkflowCandidate(runtime, root, requiredString(args, "workflow_id"))
    case "reconcile":
      return await reconcileWorkflow(runtime, root, optionalString(args, "workflow_id"))
    default:
      throw new Error(`unknown workflow operation: ${operation}`)
  }
}

function historyOperation(args: Record<string, unknown>): unknown {
  const operation = requiredString(args, "operation")
  const project = runtime.project(projectRoot(args))
  const database = runtime.requireStore()
  switch (operation) {
    case "list":
      return {
        entries: readHistory(
          database,
          project.id,
          boundedInteger(args, "after_sequence", -1, Number.MAX_SAFE_INTEGER) ?? null,
          boundedInteger(args, "limit", 1, 1000) ?? 100,
        ),
      }
    case "verify":
      return { chain: verifyHistory(database), checkpoints: verifyCheckpoints(database) }
    case "checkpoint": {
      const checkpoint = signCheckpoint(database, runtime.dataDirectory)
      return { checkpoint, verification: verifyCheckpoints(database) }
    }
    default:
      throw new Error(`unknown history operation: ${operation}`)
  }
}

async function limitsOperation(args: Record<string, unknown>): Promise<unknown> {
  const operation = requiredString(args, "operation")
  const root = projectRoot(args)
  const project = runtime.project(root)
  const database = runtime.requireStore()
  const reading = await runtime.resources()
  if (operation === "status") return runtime.admission.report(database, project.id, reading)

  const workflowId = requiredString(args, "workflow_id")
  requireProjectWorkflow(runtime, root, workflowId)
  switch (operation) {
    case "admit":
      return runtime.admission.request(database, project.id, workflowId, reading)
    case "renew":
      return runtime.admission.renew(database, workflowId)
    case "release":
      release(database, workflowId)
      return { released: true, workflowId }
    default:
      throw new Error(`unknown limits operation: ${operation}`)
  }
}

function projectRoot(args: Record<string, unknown>): string {
  return runtime.project(requiredString(args, "project_root")).path
}

function contained(root: string, value: string): string {
  const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value)
  const fromRoot = relative(root, absolute)
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) return absolute
  throw new Error("path must remain inside project_root")
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${key} is required`)
  if (Buffer.byteLength(value, "utf8") > 1024 * 1024) throw new Error(`${key} is too large`)
  return value
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") throw new Error(`${key} must be a string`)
  if (Buffer.byteLength(value, "utf8") > 64 * 1024) throw new Error(`${key} is too large`)
  return value
}

function requiredRecord(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key]
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${key} must be an object`)
  }
  return value as Record<string, unknown>
}

function optionalInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (!Number.isSafeInteger(value)) throw new Error(`${key} must be an integer`)
  return value as number
}

function boundedInteger(
  args: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const value = optionalInteger(args, key)
  if (value === undefined) return undefined
  if (value < minimum || value > maximum) {
    throw new Error(`${key} must be between ${minimum} and ${maximum}`)
  }
  return value
}

function oneOf<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T {
  const value = requiredString(args, key)
  if (!values.includes(value as T)) throw new Error(`${key} must be one of ${values.join(", ")}`)
  return value as T
}

function optionalStrings(args: Record<string, unknown>, key: string): string[] {
  const value = args[key]
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${key} must be an array of strings`)
  }
  if (value.length > 1000 || value.some((item) => Buffer.byteLength(item, "utf8") > 4096)) {
    throw new Error(`${key} exceeds its size limit`)
  }
  return value
}

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return { additionalProperties: false, properties, required, type: "object" }
}

function stringSchema(description: string): Record<string, unknown> {
  return { description, type: "string" }
}

function enumSchema(values: readonly string[]): Record<string, unknown> {
  return { enum: values, type: "string" }
}

function arraySchema(description: string): Record<string, unknown> {
  return { description, items: { type: "string" }, type: "array" }
}

interface ScriptResult {
  readonly stderr: string
  readonly stdout: string
}

function runScript(script: string, args: readonly string[], timeoutMs: number): Promise<ScriptResult> {
  const outputLimit = 4 * 1024 * 1024
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [join(SCRIPTS, script), ...args], {
      cwd: ROOT,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    let stderr = ""
    let stdout = ""
    let failure: Error | undefined
    const timeout = setTimeout(() => {
      failure = new Error(`${script} exceeded ${timeoutMs}ms`)
      child.kill()
    }, timeoutMs)

    const capture = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8")
      if (Buffer.byteLength(next, "utf8") > outputLimit) {
        if (failure === undefined) {
          failure = new Error(`${script} exceeded the ${outputLimit}-byte output limit`)
          child.kill()
        }
        return current
      }
      return next
    }

    child.stdout.on("data", (chunk: Buffer) => (stdout = capture(stdout, chunk)))
    child.stderr.on("data", (chunk: Buffer) => (stderr = capture(stderr, chunk)))
    child.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timeout)
      if (failure !== undefined) reject(failure)
      else if (code === 0) resolveResult({ stderr, stdout })
      else reject(new Error(`${script} exited ${code}: ${stderr.trim() || "no error output"}`))
    })
  })
}

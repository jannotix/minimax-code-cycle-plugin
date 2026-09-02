#!/usr/bin/env node

import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, win32 } from "node:path"
import { fileURLToPath } from "node:url"

import { release } from "./admission.ts"
import { nextCoordinatorAction } from "./coordinator.ts"
import { diagnose } from "./diagnostics.ts"
import { isInterfaceFile } from "./evidence/design.ts"
import {
  abort as abortGoal,
  advance as advanceGoal,
  amend as amendGoal,
  approveCompletion,
  currentPlan,
  extend as extendGoal,
  focus as focusGoal,
  goals,
  link as linkGoal,
  newGoal,
  pause as pauseGoal,
  plan as planGoal,
  requestCompletion,
  resume as resumeGoal,
  status as goalStatus,
} from "./goals.ts"
import { indexProject } from "./intel/indexer.ts"
import { ParsePool } from "./intel/pool.ts"
import { findSymbol, impactOf, neighboursOf, scopeBundle } from "./intel/query.ts"
import { chainOf, explain, forget, recall } from "./memory.ts"
import { serve, type ToolDefinition } from "./mcp.ts"
import { pressure } from "./resources.ts"
import { Runtime } from "./runtime.ts"
import {
  assessAgent,
  assessUninstall,
  contentDigest,
  managedAgentMarkdown,
  managedSystemPrompt,
  ownershipMarker,
  ROLE_SETUP,
  roleSetup,
  SETUP_NAMESPACE,
  SETUP_OWNER,
  SETUP_SCHEMA,
  validateSetupReceipt,
  type AgentSnapshot,
  type CycleRole,
} from "./setup.ts"
import { signCheckpoint, verifyCheckpoints } from "./store/checkpoints.ts"
import { graphSize } from "./store/graph.ts"
import { frozenFiles } from "./store/workflows.ts"
import { readHistory, verifyHistory } from "./store/history.ts"
import {
  amendWorkflow,
  arbitrateWorkflow,
  bindWorkflowRoleSession,
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
    name: "cycle_setup",
    description:
      "Return the native Mavis agent setup specification, deterministically assess one observed " +
      "agent for create/update/noop/conflict, authorize deletion only for a Cycle-owned agent, or " +
      "validate a sanitized readiness receipt. " +
      "For Custom Agents, canonical agent.md is the system-prompt authority; native system_prompt updates are unsupported. " +
      "This tool never mutates the MiniMax profile; the Cycle Skill uses the native mavis tool.",
    inputSchema: objectSchema(
      {
        operation: enumSchema(["spec", "assess", "uninstall", "validate_receipt"]),
        role: enumSchema(["architect", "executor", "functional_reviewer", "security_reviewer", "arbiter"]),
        observed_name: stringSchema("Name returned by native mavis agent get.", 128),
        observed_description: stringSchema("Description returned by native mavis agent get.", 2_048),
        observed_agent_markdown: stringSchema("Canonical agent.md read from the active profile.", 65_536),
        observed_system_prompt: stringSchema("System prompt returned by native mavis agent get.", 65_536),
        receipt: { type: "object" },
      },
      ["operation"],
    ),
    run: (args) => setupOperation(args),
  },
  {
    name: "cycle_coordinator",
    description:
      "Return the single legal next coordinator action from durable workflow state. Requires a " +
      "validated ready setup receipt and explicit native mavis/task/browser capability facts. " +
      "The planner is read-only and never dispatches a role or advances workflow state itself.",
    inputSchema: objectSchema(
      {
        operation: enumSchema(["next"]),
        project_root: stringSchema("Absolute project directory."),
        workflow_id: stringSchema("Durable workflow identifier.", 64),
        setup_receipt: { type: "object" },
        native_mavis: { type: "boolean" },
        native_task: { type: "boolean" },
        browser: enumSchema(["available", "unavailable", "unknown"]),
      },
      [
        "operation",
        "project_root",
        "workflow_id",
        "setup_receipt",
        "native_mavis",
        "native_task",
        "browser",
      ],
    ),
    run: (args) => coordinatorOperation(args),
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
          "bind_role_session",
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
        role: enumSchema(["architect", "executor", "functional_reviewer", "security_reviewer", "arbiter"]),
        role_session_id: stringSchema("Native Mavis session identifier for the acting role.", 128),
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
      "Build or refresh the bounded Tree-sitter WASM code graph. Unchanged files are not read or " +
      "reparsed, unsafe links are skipped, and verification work preempts indexing.",
    inputSchema: objectSchema(
      {
        project_root: stringSchema("Absolute project directory."),
        workers: { maximum: 8, minimum: 1, type: "integer" },
      },
      ["project_root"],
    ),
    run: async (args) => await graphIndexOperation(args),
  },
  {
    name: "cycle_graph_query",
    description:
      "Query the durable code graph without reading project files: symbol lookup, bounded " +
      "neighbour and impact traversal, budgeted scope bundles, or graph status.",
    inputSchema: objectSchema(
      {
        project_root: stringSchema("Absolute project directory."),
        operation: enumSchema(["status", "symbol", "neighbours", "impact", "scope"]),
        name: stringSchema("Exact symbol name for symbol or neighbours.", 256),
        paths: arraySchema("Project-relative paths for impact or scope.", 200),
        depth: { maximum: 4, minimum: 1, type: "integer" },
        budget_bytes: { maximum: 1000000, minimum: 1000, type: "integer" },
      },
      ["operation", "project_root"],
    ),
    run: (args) => graphQueryOperation(args),
  },
  {
    name: "cycle_memory",
    description:
      "Search compact project knowledge, explain selected entries with provenance, inspect a " +
      "supersession chain, or explicitly revoke an entry without deleting its audit record.",
    inputSchema: objectSchema(
      {
        project_root: stringSchema("Absolute project directory."),
        operation: enumSchema(["search", "explain", "chain", "forget"]),
        query: stringSchema("Bounded full-text search query.", 4_096),
        paths: arraySchema("Project-relative paths used for applicability recall.", 200),
        ids: arraySchema("Memory identifiers to explain.", 20),
        memory_id: stringSchema("Memory identifier for chain or forget.", 64),
        limit: { maximum: 50, minimum: 1, type: "integer" },
        confirm: { type: "boolean" },
      },
      ["operation", "project_root"],
    ),
    run: (args) => memoryOperation(args),
  },
  {
    name: "cycle_goal",
    description:
      "Manage a durable project objective above evidence-gated workflows. Objectives are immutable, " +
      "plans are versioned, continuation is bounded, and completion requires explicit approval.",
    inputSchema: objectSchema(
      {
        project_root: stringSchema("Absolute project directory."),
        operation: enumSchema([
          "new", "list", "focus", "plan", "link", "amend", "status", "advance",
          "extend", "pause", "resume", "complete", "approve", "abort",
        ]),
        goal_id: stringSchema("Goal identifier for non-new operations.", 64),
        objective: stringSchema("Immutable goal objective.", 8_192),
        success_criteria: arraySchema("Observable completion criteria.", 50),
        constraints: arraySchema("Goal constraints.", 50),
        non_goals: arraySchema("Explicitly excluded outcomes.", 50),
        max_continuations: { maximum: 50, minimum: 1, type: "integer" },
        content: stringSchema("Versioned goal plan content.", 8_192),
        milestone: stringSchema("Milestone name.", 200),
        workflow_id: stringSchema("Evidence-gated workflow linked to a milestone.", 64),
        clarification: stringSchema("Append-only clarification.", 8_192),
        additional: { maximum: 50, minimum: 1, type: "integer" },
        confirm: { type: "boolean" },
      },
      ["operation", "project_root"],
    ),
    run: (args) => goalOperation(args),
  },
]

serve({ name: "cycle-control-plane-minimax", version: VERSION }, tools)

process.on("exit", () => runtime.close())

function setupOperation(args: Record<string, unknown>): unknown {
  const operation = requiredString(args, "operation")
  if (operation === "spec") {
    return {
      agents: ROLE_SETUP.map((entry) => {
        const body = setupPrompt(entry.role)
        const systemPrompt = managedSystemPrompt(entry.role, body)
        return {
          access: entry.access,
          description: entry.description,
          displayName: entry.displayName,
          marker: ownershipMarker(entry.role),
          name: entry.agentName,
          promptPath: entry.promptPath,
          promptDigest: contentDigest(systemPrompt),
          profile: managedAgentMarkdown(entry.role, body),
          profileDigest: contentDigest(managedAgentMarkdown(entry.role, body)),
          role: entry.role,
          systemPrompt,
          systemPromptSource: "canonical-agent.md",
          tools: entry.tools,
        }
      }),
      mcp: {
        argsFromPluginRoot: ["dist/server.js"],
        command: "node",
        description: `cycle-managed:${SETUP_OWNER};version=${VERSION}`,
        name: "cycle-tools",
        transport: "stdio",
      },
      host: {
        agentApi: "native-mavis-tool-only",
        capabilityProfile: "canonical-agent-markdown",
        liveCapabilityProof: "required-before-production",
        localSkillInstall: "not-certified-on-minimax-3.0.68.134",
        modelStrategy: "session-inherited-unless-native-round-trip-proves-an-agent-model",
        promptAuthority: "canonical-agent-markdown-only",
      },
      namespace: SETUP_NAMESPACE,
      owner: SETUP_OWNER,
      schema: SETUP_SCHEMA,
      version: VERSION,
    }
  }
  if (operation === "validate_receipt") {
    return { receipt: validateSetupReceipt(requiredRecord(args, "receipt"), VERSION), valid: true }
  }

  const role = oneOf(args, "role", [
    "architect",
    "executor",
    "functional_reviewer",
    "security_reviewer",
    "arbiter",
  ]) as CycleRole
  const observed = setupSnapshot(args)
  if (operation === "assess") {
    const observedAgentMarkdown = optionalBoundedString(args, "observed_agent_markdown", 65_536)
    const action = assessAgent(role, setupPrompt(role), observed, observedAgentMarkdown)
    const expected = roleSetup(role)
    return {
      ...action,
      expected: {
        description: expected.description,
        name: expected.agentName,
        promptDigest: contentDigest(managedSystemPrompt(role, setupPrompt(role))),
        profileDigest: contentDigest(managedAgentMarkdown(role, setupPrompt(role))),
        tools: expected.tools,
      },
      role,
    }
  }
  if (operation === "uninstall") return { ...assessUninstall(role, observed), role }
  throw new Error(`unknown setup operation: ${operation}`)
}

function setupPrompt(role: CycleRole): string {
  return readFileSync(join(ROOT, roleSetup(role).promptPath), "utf8")
}

function setupSnapshot(args: Record<string, unknown>): AgentSnapshot | undefined {
  const name = optionalBoundedString(args, "observed_name", 128)
  const description = optionalBoundedString(args, "observed_description", 2_048)
  const systemPrompt = optionalBoundedString(args, "observed_system_prompt", 65_536)
  if (name === undefined) {
    if (description !== undefined || systemPrompt !== undefined) {
      throw new Error("observed_name is required when an observed agent is supplied")
    }
    return undefined
  }
  return { description: description ?? "", name, systemPrompt: systemPrompt ?? "" }
}

function coordinatorOperation(args: Record<string, unknown>): unknown {
  const operation = requiredString(args, "operation")
  if (operation !== "next") throw new Error(`unknown coordinator operation: ${operation}`)
  const root = projectRoot(args)
  const workflowId = requiredBoundedString(args, "workflow_id", 64)
  const receipt = validateSetupReceipt(requiredRecord(args, "setup_receipt"), VERSION)
  const view = workflowStatus(runtime, root, workflowId)
  if (view === null) throw new Error("workflow not found")
  const candidatePaths = view.workflow.candidateId === null
    ? []
    : frozenFiles(runtime.requireStore(), view.workflow.candidateId).map((file) => file.path)
  const plannedPaths = view.tasks.flatMap((task) => task.writeScopes)
  const browserRequired = [...candidatePaths, ...plannedPaths].some(isInterfaceFile)
  return nextCoordinatorAction({
    browser: oneOf(args, "browser", ["available", "unavailable", "unknown"]),
    browserRequired,
    nativeMavis: requiredBoolean(args, "native_mavis"),
    nativeTask: requiredBoolean(args, "native_task"),
    reviews: view.reviews,
    roleSessions: view.roleSessions,
    setupReady: receipt.status === "ready",
    tasks: view.tasks,
    workflow: view.workflow,
  })
}

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
    case "bind_role_session":
      return bindWorkflowRoleSession(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        oneOf(args, "role", ["architect", "executor", "functional_reviewer", "security_reviewer", "arbiter"]),
        requiredBoundedString(args, "role_session_id", 128),
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
        requiredBoundedString(args, "role_session_id", 128),
      )
    case "report_task":
      return await reportTask(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        requiredString(args, "task_key"),
        oneOf(args, "task_status", ["blocked", "completed", "plan_defect"]),
        requiredString(args, "summary"),
        requiredBoundedString(args, "role_session_id", 128),
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
        requiredBoundedString(args, "role_session_id", 128),
      )
    case "submit_browser_evidence":
      return submitBrowserEvidence(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        requiredRecord(args, "snapshot"),
        requiredBoundedString(args, "role_session_id", 128),
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
      }, requiredBoundedString(args, "role_session_id", 128))
    }
    case "arbitrate":
      return arbitrateWorkflow(
        runtime,
        root,
        requiredString(args, "workflow_id"),
        requiredRecord(args, "verdict"),
        requiredBoundedString(args, "role_session_id", 128),
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

async function graphIndexOperation(args: Record<string, unknown>): Promise<unknown> {
  const project = runtime.project(projectRoot(args))
  const database = runtime.requireStore()
  const resources = await runtime.resources()
  const blocked = pressure(resources, runtime.admission.limits.reserves)
  if (blocked !== null) return { deferred: true, reason: blocked, resources }

  const workers = boundedInteger(args, "workers", 1, 8)
  const pool = workers === undefined ? undefined : new ParsePool(workers)
  const started = Date.now()
  try {
    const report = await indexProject(database, project.id, project.path, {
      ...(pool === undefined ? {} : { pool }),
      shouldYield: () => verificationPending(database, project.id),
    })
    return {
      ...report,
      deferred: false,
      durationMs: Date.now() - started,
      projectId: project.id,
    }
  } finally {
    await pool?.dispose()
  }
}

function graphQueryOperation(args: Record<string, unknown>): unknown {
  const project = runtime.project(projectRoot(args))
  const database = runtime.requireStore()
  const operation = requiredString(args, "operation")
  const paths = projectPaths(args, "paths", 200)
  const depth = boundedInteger(args, "depth", 1, 4) ?? 2
  switch (operation) {
    case "status":
      return graphSize(database, project.id)
    case "symbol":
      return { nodes: findSymbol(database, project.id, requiredBoundedString(args, "name", 256)) }
    case "neighbours": {
      const [node] = findSymbol(database, project.id, requiredBoundedString(args, "name", 256))
      if (node === undefined) return { edges: [], found: false, visited: [] }
      return { ...neighboursOf(database, node.id, depth), found: true, node }
    }
    case "impact":
      requirePaths(paths, operation)
      return { nodes: impactOf(database, project.id, paths, depth) }
    case "scope":
      requirePaths(paths, operation)
      return scopeBundle(
        database,
        project.id,
        paths,
        boundedInteger(args, "budget_bytes", 1_000, 1_000_000),
      )
    default:
      throw new Error(`unknown graph operation: ${operation}`)
  }
}

function memoryOperation(args: Record<string, unknown>): unknown {
  const project = runtime.project(projectRoot(args))
  const context = { database: runtime.requireStore(), projectId: project.id }
  const operation = requiredString(args, "operation")
  switch (operation) {
    case "search":
      return {
        memories: recall(
          context,
          optionalBoundedString(args, "query", 4_096) ?? "",
          projectPaths(args, "paths", 200, true),
          boundedInteger(args, "limit", 1, 50),
        ),
      }
    case "explain":
      return { memories: explain(context, identifiers(args, "ids", 20)) }
    case "chain":
      return { chain: chainOf(context, requiredBoundedString(args, "memory_id", 64)) }
    case "forget":
      if (args["confirm"] !== true) throw new Error("forget requires confirm: true")
      return forget(context, requiredBoundedString(args, "memory_id", 64))
    default:
      throw new Error(`unknown memory operation: ${operation}`)
  }
}

function goalOperation(args: Record<string, unknown>): unknown {
  const project = runtime.project(projectRoot(args))
  const context = { database: runtime.requireStore(), projectId: project.id }
  const operation = requiredString(args, "operation")
  const goalId = () => requiredBoundedString(args, "goal_id", 64)
  switch (operation) {
    case "new":
      const maxContinuations = boundedInteger(args, "max_continuations", 1, 50)
      return newGoal(context, {
        constraints: identifiers(args, "constraints", 50, 8_000),
        ...(maxContinuations === undefined ? {} : { maxContinuations }),
        nonGoals: identifiers(args, "non_goals", 50, 8_000),
        objective: requiredBoundedString(args, "objective", 8_192),
        successCriteria: identifiers(args, "success_criteria", 50, 8_000),
      })
    case "list": return goals(context)
    case "focus": return focusGoal(context, goalId())
    case "plan": {
      const content = optionalBoundedString(args, "content", 8_192)
      return content === undefined ? currentPlan(context, goalId()) : planGoal(context, goalId(), content)
    }
    case "link":
      return linkGoal(
        context,
        goalId(),
        requiredBoundedString(args, "milestone", 200),
        optionalBoundedString(args, "workflow_id", 64) ?? null,
      )
    case "amend": return amendGoal(context, goalId(), requiredBoundedString(args, "clarification", 8_192))
    case "status": return goalStatus(context, optionalBoundedString(args, "goal_id", 64))
    case "advance": return advanceGoal(context, goalId())
    case "extend": return extendGoal(context, goalId(), boundedInteger(args, "additional", 1, 50) ?? 1)
    case "pause": return pauseGoal(context, goalId())
    case "resume": return resumeGoal(context, goalId())
    case "complete": return requestCompletion(context, goalId())
    case "approve": return approveCompletion(context, goalId(), args["confirm"] === true)
    case "abort": return abortGoal(context, goalId(), args["confirm"] === true)
    default:
      throw new Error(`unknown goal operation: ${operation}`)
  }
}

function verificationPending(database: ReturnType<typeof runtime.requireStore>, projectId: string): boolean {
  const row = database.get<{ total: number }>(
    "select count(*) as total from workflows where project_id = ? and state = 'verification'",
    projectId,
  )
  return Number(row?.total ?? 0) > 0
}

function requirePaths(paths: readonly string[], operation: string): void {
  if (paths.length === 0) throw new Error(`${operation} requires at least one path`)
}

function projectPaths(
  args: Record<string, unknown>,
  key: string,
  maximum: number,
  allowRoot = false,
): string[] {
  return identifiers(args, key, maximum, 4_096).map((value) => {
    const normalized = value.replaceAll("\\", "/")
    if (allowRoot && normalized === ".") return normalized
    const parts = normalized.split("/")
    if (
      isAbsolute(value) ||
      win32.isAbsolute(value) ||
      parts.some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error(`${key} must contain only safe project-relative paths`)
    }
    return normalized
  })
}

function identifiers(
  args: Record<string, unknown>,
  key: string,
  maximum: number,
  maximumBytes = 256,
): string[] {
  const values = optionalStrings(args, key)
  if (values.length > maximum || values.some((value) => Buffer.byteLength(value, "utf8") > maximumBytes)) {
    throw new Error(`${key} exceeds its size limit`)
  }
  return values
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

function requiredBoolean(args: Record<string, unknown>, key: string): boolean {
  const value = args[key]
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`)
  return value
}

function requiredBoundedString(
  args: Record<string, unknown>,
  key: string,
  maximumBytes: number,
): string {
  const value = requiredString(args, key)
  if (Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new Error(`${key} exceeds the ${maximumBytes}-byte limit`)
  }
  return value
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") throw new Error(`${key} must be a string`)
  if (Buffer.byteLength(value, "utf8") > 64 * 1024) throw new Error(`${key} is too large`)
  return value
}

function optionalBoundedString(
  args: Record<string, unknown>,
  key: string,
  maximumBytes: number,
): string | undefined {
  const value = optionalString(args, key)
  if (value !== undefined && Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new Error(`${key} exceeds the ${maximumBytes}-byte limit`)
  }
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

function stringSchema(description: string, maxLength?: number): Record<string, unknown> {
  return { description, ...(maxLength === undefined ? {} : { maxLength }), type: "string" }
}

function enumSchema(values: readonly string[]): Record<string, unknown> {
  return { enum: values, type: "string" }
}

function arraySchema(description: string, maxItems?: number): Record<string, unknown> {
  return {
    description,
    items: { type: "string" },
    ...(maxItems === undefined ? {} : { maxItems }),
    type: "array",
  }
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

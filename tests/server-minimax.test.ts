import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"

interface RpcResponse {
  readonly error?: { readonly code: number; readonly message: string }
  readonly id: number | string | null
  readonly result?: unknown
}

class McpClient {
  readonly #child: ChildProcessWithoutNullStreams
  readonly #queued: RpcResponse[] = []
  readonly #waiters: ((response: RpcResponse) => void)[] = []
  #buffer = ""
  #nextId = 1

  constructor(environment: NodeJS.ProcessEnv) {
    this.#child = spawn(process.execPath, [join(process.cwd(), "dist", "server.js")], {
      cwd: process.cwd(),
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    this.#child.stdout.on("data", (chunk: Buffer) => {
      this.#buffer += chunk.toString("utf8")
      const lines = this.#buffer.split(/\r?\n/u)
      this.#buffer = lines.pop() ?? ""
      for (const line of lines.filter(Boolean)) this.#deliver(JSON.parse(line) as RpcResponse)
    })
  }

  raw(line: string): Promise<RpcResponse> {
    this.#child.stdin.write(`${line}\n`)
    return this.#next()
  }

  call(method: string, params: unknown = {}): Promise<RpcResponse> {
    const id = this.#nextId++
    this.#child.stdin.write(`${JSON.stringify({ id, jsonrpc: "2.0", method, params })}\n`)
    return this.#next()
  }

  async stop(): Promise<void> {
    this.#child.stdin.end()
    if (this.#child.exitCode !== null) return
    await new Promise<void>((resolveExit, reject) => {
      this.#child.once("exit", () => resolveExit())
      this.#child.once("error", reject)
    })
  }

  #deliver(response: RpcResponse): void {
    const waiter = this.#waiters.shift()
    if (waiter === undefined) this.#queued.push(response)
    else waiter(response)
  }

  #next(): Promise<RpcResponse> {
    const queued = this.#queued.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    return new Promise((resolveResponse, reject) => {
      const timeout = setTimeout(() => reject(new Error("MCP response timed out")), 5_000)
      this.#waiters.push((response) => {
        clearTimeout(timeout)
        resolveResponse(response)
      })
    })
  }
}

function toolBody(response: RpcResponse): unknown {
  const result = response.result as {
    readonly content?: readonly { readonly text?: string; readonly type?: string }[]
    readonly isError?: boolean
  }
  assert.notEqual(result?.isError, true, result?.content?.[0]?.text ?? "tool returned an error")
  const text = result?.content?.[0]?.text
  if (typeof text !== "string") throw new Error("tool response did not contain text")
  return JSON.parse(text)
}

test("the MCP control plane is strict, project-scoped, and durable across restart", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-mcp-"))
  const projectA = join(scratch, "project-a")
  const projectB = join(scratch, "project-b")
  mkdirSync(projectA)
  mkdirSync(projectB)
  const environment = { ...process.env, CYCLE_DATA_DIR: join(scratch, "data") }

  const first = new McpClient(environment)
  let expectedIndexedFiles = 0
  let workflowId = ""
  try {
    const parse = await first.raw("{not json")
    assert.equal(parse.id, null)
    assert.equal(parse.error?.code, -32700)

    const invalid = await first.raw(JSON.stringify({ id: 99, jsonrpc: "2.0" }))
    assert.equal(invalid.id, 99)
    assert.equal(invalid.error?.code, -32600)

    const oversized = await first.raw("x".repeat(2 * 1024 * 1024 + 1))
    assert.equal(oversized.id, null)
    assert.equal(oversized.error?.code, -32600)

    const initialized = await first.call("initialize", {
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
      protocolVersion: "2025-06-18",
    })
    const identity = initialized.result as { serverInfo: { version: string }; protocolVersion: string }
    assert.equal(identity.protocolVersion, "2025-06-18")
    assert.equal(identity.serverInfo.version, "2.0.0-alpha.4")

    const listed = await first.call("tools/list")
    const names = (listed.result as { tools: readonly { name: string }[] }).tools.map((tool) => tool.name)
    assert.deepEqual(names, [
      "cycle_doctor",
      "cycle_workflow",
      "cycle_history",
      "cycle_limits",
      "cycle_verify_audit",
      "cycle_freeze_candidate",
      "cycle_graph_index",
      "cycle_graph_query",
      "cycle_memory",
      "cycle_goal",
    ])

    const goal = toolBody(await first.call("tools/call", {
      arguments: {
        objective: "ship the authorization flow",
        operation: "new",
        project_root: projectA,
        success_criteria: ["authorization survives restart"],
      },
      name: "cycle_goal",
    })) as { goalId: string }

    writeFileSync(join(projectA, "index.ts"), "export function indexed() { return 1 }\n")
    const indexed = toolBody(await first.call("tools/call", {
      arguments: { project_root: projectA, workers: 1 },
      name: "cycle_graph_index",
    })) as { deferred: boolean; files?: number; reason?: string }
    if (indexed.deferred) assert.ok(indexed.reason)
    else {
      assert.equal(indexed.files, 1)
      expectedIndexedFiles = 1
    }

    const graph = toolBody(await first.call("tools/call", {
      arguments: { operation: "status", project_root: projectA },
      name: "cycle_graph_query",
    })) as { files: number }
    assert.equal(graph.files, expectedIndexedFiles)

    const oversizedSymbol = await first.call("tools/call", {
      arguments: { name: "x".repeat(257), operation: "symbol", project_root: projectA },
      name: "cycle_graph_query",
    })
    assert.equal((oversizedSymbol.result as { isError?: boolean }).isError, true)

    const emptyMemory = toolBody(await first.call("tools/call", {
      arguments: { operation: "search", project_root: projectA, query: "nothing yet" },
      name: "cycle_memory",
    })) as { memories: unknown[] }
    assert.deepEqual(emptyMemory.memories, [])

    const started = toolBody(await first.call("tools/call", {
      arguments: {
        operation: "start",
        preference: "auto",
        project_root: projectA,
        request: "Implement payment authorization",
      },
      name: "cycle_workflow",
    })) as { goalId: string | null; workflow: { id: string; mode: string; state: string } }
    workflowId = started.workflow.id
    assert.equal(started.goalId, goal.goalId)
    assert.equal(started.workflow.mode, "full")
    assert.equal(started.workflow.state, "architecture")

    const relative = await first.call("tools/call", {
      arguments: { operation: "status", project_root: ".", workflow_id: workflowId },
      name: "cycle_workflow",
    })
    assert.equal((relative.result as { isError?: boolean }).isError, true)

    const crossProject = await first.call("tools/call", {
      arguments: { operation: "status", project_root: projectB, workflow_id: workflowId },
      name: "cycle_workflow",
    })
    assert.equal((crossProject.result as { isError?: boolean }).isError, true)

    const hiddenGoal = toolBody(await first.call("tools/call", {
      arguments: { goal_id: goal.goalId, operation: "status", project_root: projectB },
      name: "cycle_goal",
    })) as { found: boolean }
    assert.equal(hiddenGoal.found, false)

    const invalidLimit = await first.call("tools/call", {
      arguments: { limit: 0, operation: "list", project_root: projectA },
      name: "cycle_history",
    })
    assert.equal((invalidLimit.result as { isError?: boolean }).isError, true)

    const verified = toolBody(await first.call("tools/call", {
      arguments: { operation: "verify", project_root: projectA },
      name: "cycle_history",
    })) as { chain: { valid: boolean } }
    assert.equal(verified.chain.valid, true)
  } finally {
    await first.stop()
  }

  const second = new McpClient(environment)
  try {
    const restored = toolBody(await second.call("tools/call", {
      arguments: { operation: "status", project_root: projectA, workflow_id: workflowId },
      name: "cycle_workflow",
    })) as { workflow: { id: string; state: string } }
    assert.equal(restored.workflow.id, workflowId)
    assert.equal(restored.workflow.state, "architecture")

    const rememberedGoal = toolBody(await second.call("tools/call", {
      arguments: { operation: "status", project_root: projectA },
      name: "cycle_goal",
    })) as { found: boolean; milestones: { workflowId: string }[] }
    assert.equal(rememberedGoal.found, true)
    assert.deepEqual(rememberedGoal.milestones.map((entry) => entry.workflowId), [workflowId])

    const doctor = toolBody(await second.call("tools/call", {
      arguments: { project_root: projectA },
      name: "cycle_doctor",
    })) as {
      ok: boolean
      store: {
        admission: { resources: { cpuLoad: number | null } }
        goals: { total: number }
        graph: { files: number }
        memory: { total: number }
        schemaVersion: number
      }
    }
    assert.equal(doctor.ok, true)
    assert.equal(doctor.store.schemaVersion, 7)
    assert.equal(doctor.store.goals.total, 1)
    assert.equal(doctor.store.graph.files, expectedIndexedFiles)
    assert.equal(doctor.store.memory.total, 0)
    assert.ok(doctor.store.admission.resources.cpuLoad === null || doctor.store.admission.resources.cpuLoad >= 0)
  } finally {
    await second.stop()
    rmSync(scratch, { force: true, recursive: true })
  }
})

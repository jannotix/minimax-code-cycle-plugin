import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
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
    assert.equal(identity.serverInfo.version, "2.0.0-alpha.3")

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
    ])

    const started = toolBody(await first.call("tools/call", {
      arguments: {
        operation: "start",
        preference: "auto",
        project_root: projectA,
        request: "Implement payment authorization",
      },
      name: "cycle_workflow",
    })) as { workflow: { id: string; mode: string; state: string } }
    workflowId = started.workflow.id
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

    const doctor = toolBody(await second.call("tools/call", {
      arguments: { project_root: projectA },
      name: "cycle_doctor",
    })) as { ok: boolean; store: { schemaVersion: number } }
    assert.equal(doctor.ok, true)
    assert.equal(doctor.store.schemaVersion, 7)
  } finally {
    await second.stop()
    rmSync(scratch, { force: true, recursive: true })
  }
})

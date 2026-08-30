import { fileURLToPath } from "node:url"

const READ_ONLY_ROLES = new Set([
  "architect",
  "functional_reviewer",
  "security_reviewer",
  "arbiter",
])
const ROLES = new Set([...READ_ONLY_ROLES, "executor"])
const AGENT_NAMES = {
  architect: "cycle-v2-architect",
  executor: "cycle-v2-executor",
  functional_reviewer: "cycle-v2-functional-reviewer",
  security_reviewer: "cycle-v2-security-reviewer",
  arbiter: "cycle-v2-arbiter",
}
const READ_ONLY_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "list",
  "lsp",
  "codesearch",
  "webfetch",
  "websearch",
  "skill",
  "viewimage",
])
const DELEGATION_TOOLS = new Set(["task", "taskcreate", "taskappend", "taskupdate"])
const SHELL_TOOLS = new Set(["bash", "shell", "terminal", "exec", "execcommand"])
const WRITE_TOOLS = new Set([
  "write",
  "edit",
  "applypatch",
  "multiedit",
  "notebookedit",
  "filewrite",
  "fileedit",
])
const READ_ONLY_GIT = new Set([
  "blame",
  "cat-file",
  "check-ignore",
  "describe",
  "diff",
  "grep",
  "log",
  "ls-files",
  "merge-base",
  "name-rev",
  "rev-parse",
  "show",
  "status",
])
const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
])

function abort(reason) {
  return { _abort: { reason } }
}

function canonicalTool(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/gu, "")
}

function operationOf(args) {
  return String(args?.operation ?? args?.control_operation ?? args?.controlOperation ?? "")
}

function isGraphQuery(tool) {
  return tool.includes("cyclegraphquery")
}

function allowedReviewerOperation(role, tool, args) {
  if (!tool.includes("cycleworkflow")) return false
  const operation = operationOf(args)
  return (
    (role === "functional_reviewer" && operation === "submit_browser_evidence") ||
    (role === "security_reviewer" && operation === "run_proof")
  )
}

function readOnlyDecision(role, tool, args) {
  if (READ_ONLY_TOOLS.has(tool) || tool.includes("browser") || isGraphQuery(tool)) return null
  if (allowedReviewerOperation(role, tool, args)) return null
  if (WRITE_TOOLS.has(tool) || SHELL_TOOLS.has(tool) || DELEGATION_TOOLS.has(tool)) {
    return abort(`The Cycle ${role} is read-only and cannot use ${tool || "this tool"}.`)
  }
  return abort(`The Cycle ${role} may use only its explicit read-only tool allowlist.`)
}

function executorDecision(tool, args) {
  if (DELEGATION_TOOLS.has(tool) || tool === "mavis" || tool.includes("cyclesetup")) {
    return abort("The Cycle executor cannot delegate, manage agents, or change Cycle setup.")
  }
  if (tool.includes("cycle") && !isGraphQuery(tool)) {
    return abort("The Cycle executor cannot drive the Cycle control plane or approve its own work.")
  }
  if (WRITE_TOOLS.has(tool) && pathsOf(args).some(isGitPath)) {
    return abort("The Cycle executor cannot write inside .git.")
  }
  if (!SHELL_TOOLS.has(tool)) return null

  const command = String(args?.command ?? args?.cmd ?? "")
  if (!command.trim()) return abort("The Cycle executor shell command is missing.")
  if (/(^|[\\/\s'"`])\.git([\\/\s'"`]|$)/iu.test(command)) {
    return abort("The Cycle executor cannot address .git through a shell command.")
  }
  for (const segment of segments(command)) {
    const verb = gitVerb(segment)
    if (verb !== null && !READ_ONLY_GIT.has(verb)) {
      return abort(`The Cycle executor cannot run mutating or unknown git operation: git ${verb}.`)
    }
  }
  return null
}

export function decide(payload, role) {
  if (!ROLES.has(role)) return abort("Cycle guard role is missing or invalid.")
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return abort("Cycle guard received an invalid hook envelope.")
  }
  const input = payload.input
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return abort("Cycle guard received no PreToolUse input.")
  }
  if (input.agentName !== AGENT_NAMES[role]) {
    return abort("Cycle guard role does not match the native agent identity.")
  }
  const tool = canonicalTool(input.toolName ?? input.tool_name)
  if (!tool) return abort("Cycle guard could not identify the requested tool.")
  const args = input.toolArgs ?? input.tool_args ?? {}
  return READ_ONLY_ROLES.has(role)
    ? readOnlyDecision(role, tool, args)
    : executorDecision(tool, args)
}

function pathsOf(value, into = []) {
  if (typeof value === "string") return into
  if (Array.isArray(value)) {
    for (const item of value) pathsOf(item, into)
    return into
  }
  if (typeof value !== "object" || value === null) return into
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && /(?:^|_)(?:file_?)?path$/iu.test(key)) into.push(item)
    else pathsOf(item, into)
  }
  return into
}

function isGitPath(value) {
  return value.replaceAll("\\", "/").split("/").some((part) => part.toLowerCase() === ".git")
}

function segments(command) {
  return command
    .split(/(?:&&|\|\||[;\n|])/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

function tokens(segment) {
  const parts = []
  let current = ""
  let quote = null
  for (const character of segment) {
    if (quote !== null) {
      if (character === quote) quote = null
      else current += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (/\s/u.test(character)) {
      if (current) parts.push(current)
      current = ""
      continue
    }
    current += character
  }
  if (current) parts.push(current)
  return parts
}

function gitVerb(segment) {
  const parts = tokens(segment)
  let index = parts.findIndex((part) => {
    const base = part.split(/[\\/]/u).at(-1)?.replace(/\.exe$/iu, "").toLowerCase()
    return base === "git"
  })
  if (index < 0) return null
  index += 1
  while (index < parts.length) {
    const option = parts[index]
    if (!option.startsWith("-")) return option.toLowerCase()
    if (option.includes("=")) {
      index += 1
      continue
    }
    index += GIT_OPTIONS_WITH_VALUE.has(option) ? 2 : 1
  }
  return "<missing>"
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const role = process.argv[2] ?? ""
  let raw = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => {
    raw += chunk
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) {
      process.stdout.write(JSON.stringify(abort("Cycle guard input exceeded 1 MiB.")))
      process.exit(0)
    }
  })
  process.stdin.on("end", () => {
    let result
    try {
      result = decide(JSON.parse(raw), role)
    } catch {
      result = abort("Cycle guard could not parse the hook envelope.")
    }
    if (result !== null) process.stdout.write(JSON.stringify(result))
  })
}

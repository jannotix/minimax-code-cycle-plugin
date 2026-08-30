import { createHash } from "node:crypto"
import { lstat, readdir, readFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export const ALLOWED = [
  { kind: "file", path: "plugin.json" },
  { kind: "file", path: "mcp.json" },
  { kind: "file", path: "LICENSE" },
  { kind: "file", path: "NOTICE" },
  { kind: "file", path: "THIRD-PARTY-NOTICES.md" },
  { kind: "file", path: "sbom.cdx.json" },
  { kind: "file", path: "license-inventory.json" },
  { kind: "file", path: "README.md" },
  { kind: "file", path: "CHANGELOG.md" },
  { kind: "file", path: "SECURITY.md" },
  { extensions: [".svg", ".png"], kind: "tree", path: "assets" },
  { extensions: [".md"], kind: "tree", path: "agents" },
  { extensions: [".md", ".json", ".mjs"], kind: "tree", path: "skills" },
  { extensions: [".js"], kind: "tree", path: "dist" },
  { extensions: [".mjs"], kind: "tree", path: "scripts", names: ["freeze-candidate.mjs", "verify-audit.mjs"] },
  { extensions: [".cjs", ".wasm", ".json"], kind: "tree", path: "vendor" },
]

export const FORBIDDEN = [
  { reason: "TypeScript source", test: (path) => /(^|\/)src(\/|$)|\.tsx?$/u.test(path) },
  { reason: "source map", test: (path) => path.endsWith(".map") },
  { reason: "test or fixture", test: (path) => /(^|\/)(tests?|fixtures?|__fixtures__)(\/|$)|\.(test|spec)\./u.test(path) },
  { reason: "development configuration", test: (path) => /(^|\/)tsconfig[^/]*\.json$/u.test(path) },
  { reason: "lockfile", test: (path) => /(^|\/)(package-lock\.json|bun\.lock|pnpm-lock\.yaml|yarn\.lock)$/u.test(path) },
  { reason: "dependency tree", test: (path) => /(^|\/)node_modules(\/|$)/u.test(path) },
  { reason: "version control", test: (path) => /(^|\/)\.git(\/|$)|(^|\/)\.gitignore$/u.test(path) },
  { reason: "credential file", test: (path) => /\.(env|key|pem|p12|pfx)$/u.test(path) },
  { reason: "development script", test: (path) => path.startsWith("scripts/") && !RUNTIME_SCRIPTS.has(path) },
]

const RUNTIME_SCRIPTS = new Set(["scripts/freeze-candidate.mjs", "scripts/verify-audit.mjs"])

export async function collect(root = ROOT) {
  const files = []
  for (const rule of ALLOWED) {
    if (rule.kind === "file") {
      await requireRegular(join(root, rule.path), rule.path)
      files.push(rule.path)
      continue
    }
    for (const found of await walk(join(root, rule.path))) {
      const name = found.slice(found.lastIndexOf(sep) + 1)
      if (!rule.extensions.some((extension) => found.endsWith(extension))) continue
      if (rule.names !== undefined && !rule.names.includes(name)) continue
      files.push(normalize(relative(root, found)))
    }
  }
  return [...new Set(files)].sort()
}

export function violations(paths) {
  return paths.flatMap((path) =>
    FORBIDDEN.filter((rule) => rule.test(path)).map((rule) => ({ path, reason: rule.reason })),
  )
}

export async function fileRecords(paths, root = ROOT) {
  return await Promise.all(
    paths.map(async (path) => {
      const bytes = await readFile(join(root, path))
      return { path, sha256: sha256(bytes), size: bytes.length }
    }),
  )
}

export function runtimePackage(source) {
  return `${JSON.stringify(
    {
      author: source.author,
      description: source.description,
      engines: source.engines,
      license: source.license,
      name: source.name,
      private: true,
      type: "module",
      version: source.version,
    },
    null,
    2,
  )}\n`
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function walk(directory, into = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) await walk(full, into)
    else if (entry.isFile()) into.push(full)
    else throw new Error(`artifact allowlist refuses non-regular path: ${full}`)
  }
  return into
}

async function requireRegular(path, display) {
  const info = await lstat(path)
  if (!info.isFile()) throw new Error(`artifact requires a regular file: ${display}`)
}

function normalize(path) {
  return path.split(sep).join("/")
}

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { collect, ROOT } from "./artifact-manifest.mjs"

const PATTERNS = [
  ["private key", /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/u],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ["GitHub token", /\b(?:gh[opsu]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/u],
  ["OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/u],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u],
]

export function findSecrets(text) {
  return PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
}

export async function scan(paths, root = ROOT) {
  const findings = []
  for (const path of paths) {
    const bytes = await readFile(join(root, path))
    if (bytes.includes(0)) continue
    for (const kind of findSecrets(bytes.toString("utf8"))) findings.push({ kind, path })
  }
  return findings
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const paths = await collect()
  const findings = await scan(paths)
  if (findings.length > 0) {
    for (const finding of findings) console.error(`${finding.path}: ${finding.kind}`)
    process.exitCode = 1
  } else {
    console.log(`Secret scan verified ${paths.length} allowlisted artifact files`)
  }
}

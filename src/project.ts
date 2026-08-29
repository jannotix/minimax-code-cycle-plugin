import { createHash } from "node:crypto"
import { realpathSync, statSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"

export interface Project {
  readonly id: string
  readonly path: string
}

/** The MCP process starts in the plugin root, so every project root must be supplied explicitly. */
export function identifyProject(directory: string, platform: NodeJS.Platform = process.platform): Project {
  if (!directory.trim() || !isAbsolute(directory)) {
    throw new Error("project_root must be an absolute path")
  }

  const path = realpathSync.native(resolve(directory))
  if (!statSync(path).isDirectory()) throw new Error("project_root must resolve to a directory")
  const normalized = platform === "win32" ? path.toLowerCase() : path
  return {
    id: createHash("sha256").update(normalized).digest("hex").slice(0, 32),
    path,
  }
}

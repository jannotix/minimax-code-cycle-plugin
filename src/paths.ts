import { homedir } from "node:os"
import { posix, resolve, win32 } from "node:path"

export type DataDirectorySource = "cycle_data_dir" | "minimax_data_dir" | "platform_default"

export interface DataDirectoryResolution {
  readonly path: string
  readonly source: DataDirectorySource
}

export class PathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PathError"
  }
}

/** Durable state intentionally outlives both the plugin package and a disposable MiniMax profile. */
export function resolveDataDirectory(
  configured: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  return resolveDataDirectoryResolution(configured, environment, platform).path
}

export function resolveDataDirectoryResolution(
  configured: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): DataDirectoryResolution {
  if (configured) return { path: resolve(configured), source: "cycle_data_dir" }

  const minimaxDataDirectory = environment["MINIMAX_DATA_DIR"]?.trim()
  if (minimaxDataDirectory) {
    return { path: profileDataDirectory(minimaxDataDirectory, platform), source: "minimax_data_dir" }
  }

  if (platform === "win32") {
    const base = environment["LOCALAPPDATA"]?.trim()
    if (!base) throw new PathError("LOCALAPPDATA is not set")
    return { path: win32.join(base, "Cycle for MiniMax Code"), source: "platform_default" }
  }

  const home = environment["HOME"]?.trim() || homedir()
  if (platform === "darwin") {
    return {
      path: posix.join(home, "Library", "Application Support", "Cycle for MiniMax Code"),
      source: "platform_default",
    }
  }

  const base = environment["XDG_DATA_HOME"]?.trim() || posix.join(home, ".local", "share")
  return { path: posix.join(base, "cycle-minimax"), source: "platform_default" }
}

function profileDataDirectory(root: string, platform: NodeJS.Platform): string {
  if (platform === "win32") return win32.join(win32.resolve(root), "Cycle for MiniMax Code")
  if (platform === "darwin") return posix.join(posix.resolve(root), "Cycle for MiniMax Code")
  return posix.join(posix.resolve(root), "cycle-minimax")
}

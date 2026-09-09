import { realpathSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, posix, relative, resolve, win32 } from "node:path"

export type DataDirectorySource = "cycle_data_dir" | "minimax_data_dir" | "platform_default"

export interface DataDirectoryResolution {
  readonly path: string
  readonly source: DataDirectorySource
}

/**
 * The on-disk spelling of a path, so two spellings of one directory compare equal. A junction, a
 * symlink or a Windows 8.3 short name makes `resolve` disagree with `realpath`, and a containment
 * check built on that disagreement silently passes exactly what it exists to refuse.
 *
 * The path need not exist: the nearest existing ancestor is canonicalized and the remaining
 * segments are rejoined, because a directory must never be created merely to be compared — least
 * of all one that is about to be rejected.
 */
export function canonicalPath(path: string): string {
  const absolute = resolve(path)
  const tail: string[] = []
  let current = absolute
  for (;;) {
    try {
      return join(realpathSync.native(current), ...tail)
    } catch {
      const parent = dirname(current)
      // The filesystem root resolved to nothing, so there is no canonical spelling to be had and
      // the lexical one is the honest answer.
      if (parent === current) return absolute
      tail.unshift(basename(current))
      current = parent
    }
  }
}

/** Whether `child` is `parent` itself or lies below it, judged on canonical spellings. */
export function containsPath(parent: string, child: string): boolean {
  const inside = relative(canonicalPath(parent), canonicalPath(child))
  return inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))
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

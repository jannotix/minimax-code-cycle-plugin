import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, win32 } from "node:path"
import { createHash } from "node:crypto"

export class UnsafeWorkspacePath extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeWorkspacePath"
  }
}

export async function digestContainedFile(root: string, path: string): Promise<string | null> {
  let handle
  try {
    const absolute = await safeExistingFile(root, path)
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
    handle = await open(absolute, constants.O_RDONLY | noFollow)
    const hash = createHash("sha256")
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk)
    await assertStillContained(root, path, absolute)
    return hash.digest("hex")
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export async function readContainedFile(
  root: string,
  path: string,
  maximumBytes: number,
): Promise<Buffer | null> {
  let handle
  try {
    const absolute = await safeExistingFile(root, path)
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
    handle = await open(absolute, constants.O_RDONLY | noFollow)
    const info = await handle.stat()
    if (!info.isFile() || info.size > maximumBytes) return null
    const bytes = await handle.readFile()
    await assertStillContained(root, path, absolute)
    return bytes
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export async function statContainedFile(
  root: string,
  path: string,
  maximumBytes: number,
): Promise<{ modifiedAt: number; size: number } | null> {
  let handle
  try {
    const absolute = await safeExistingFile(root, path)
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
    handle = await open(absolute, constants.O_RDONLY | noFollow)
    const info = await handle.stat()
    if (!info.isFile() || info.size > maximumBytes) return null
    await assertStillContained(root, path, absolute)
    return { modifiedAt: Math.floor(info.mtimeMs), size: info.size }
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** Resolve a candidate delivery path while refusing every existing symlink or junction component. */
export async function safeWritePath(root: string, path: string): Promise<string> {
  const { absolute, rootReal, segments } = await lexical(root, path)
  let current = rootReal
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) {
        throw new UnsafeWorkspacePath(`${path} crosses a symbolic link or junction`)
      }
      if (index < segments.length - 1 && !info.isDirectory()) {
        throw new UnsafeWorkspacePath(`${path} crosses a non-directory component`)
      }
      if (index === segments.length - 1 && !info.isFile()) {
        throw new UnsafeWorkspacePath(`${path} is not a regular file`)
      }
    } catch (error) {
      if (isMissing(error)) break
      throw error
    }
  }
  return absolute
}

async function safeExistingFile(root: string, path: string): Promise<string> {
  const { absolute, rootReal, segments } = await lexical(root, path)
  let current = rootReal
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!)
    const info = await lstat(current)
    if (info.isSymbolicLink()) {
      throw new UnsafeWorkspacePath(`${path} crosses a symbolic link or junction`)
    }
    if (index < segments.length - 1 && !info.isDirectory()) {
      throw new UnsafeWorkspacePath(`${path} crosses a non-directory component`)
    }
    if (index === segments.length - 1 && !info.isFile()) {
      throw new UnsafeWorkspacePath(`${path} is not a regular file`)
    }
  }
  await assertStillContained(root, path, absolute)
  return absolute
}

async function assertStillContained(root: string, path: string, expected: string): Promise<void> {
  const rootReal = await realpath(root)
  const actual = await realpath(expected)
  if (!samePath(actual, expected) || !contained(rootReal, actual)) {
    throw new UnsafeWorkspacePath(`${path} resolves outside project_root`)
  }
}

async function lexical(
  root: string,
  path: string,
): Promise<{ absolute: string; rootReal: string; segments: string[] }> {
  if (!path || path.includes("\0") || isAbsolute(path) || win32.isAbsolute(path)) {
    throw new UnsafeWorkspacePath("candidate paths must be relative")
  }
  const segments = path.replaceAll("\\", "/").split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new UnsafeWorkspacePath(`${path} contains an unsafe component`)
  }
  const rootReal = await realpath(root)
  const absolute = resolve(rootReal, ...segments)
  if (!contained(rootReal, absolute)) throw new UnsafeWorkspacePath(`${path} escapes project_root`)
  return { absolute, rootReal, segments }
}

function contained(root: string, path: string): boolean {
  const fromRoot = relative(root, path)
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

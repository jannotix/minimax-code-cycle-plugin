import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, win32 } from "node:path";
import { createHash } from "node:crypto";
export class UnsafeWorkspacePath extends Error {
    constructor(message) {
        super(message);
        this.name = "UnsafeWorkspacePath";
    }
}
export async function digestContainedFile(root, path) {
    let handle;
    try {
        const absolute = await safeExistingFile(root, path);
        const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
        handle = await open(absolute, constants.O_RDONLY | noFollow);
        const hash = createHash("sha256");
        for await (const chunk of handle.createReadStream({ autoClose: false }))
            hash.update(chunk);
        await assertStillContained(root, path, absolute);
        return hash.digest("hex");
    }
    catch {
        return null;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
export async function readContainedFile(root, path, maximumBytes) {
    let handle;
    try {
        const absolute = await safeExistingFile(root, path);
        const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
        handle = await open(absolute, constants.O_RDONLY | noFollow);
        const info = await handle.stat();
        if (!info.isFile() || info.size > maximumBytes)
            return null;
        const bytes = await handle.readFile();
        await assertStillContained(root, path, absolute);
        return bytes;
    }
    catch {
        return null;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
export async function safeWritePath(root, path) {
    const { absolute, rootReal, segments } = await lexical(root, path);
    let current = rootReal;
    for (let index = 0; index < segments.length; index += 1) {
        current = join(current, segments[index]);
        try {
            const info = await lstat(current);
            if (info.isSymbolicLink()) {
                throw new UnsafeWorkspacePath(`${path} crosses a symbolic link or junction`);
            }
            if (index < segments.length - 1 && !info.isDirectory()) {
                throw new UnsafeWorkspacePath(`${path} crosses a non-directory component`);
            }
            if (index === segments.length - 1 && !info.isFile()) {
                throw new UnsafeWorkspacePath(`${path} is not a regular file`);
            }
        }
        catch (error) {
            if (isMissing(error))
                break;
            throw error;
        }
    }
    return absolute;
}
async function safeExistingFile(root, path) {
    const { absolute, rootReal, segments } = await lexical(root, path);
    let current = rootReal;
    for (let index = 0; index < segments.length; index += 1) {
        current = join(current, segments[index]);
        const info = await lstat(current);
        if (info.isSymbolicLink()) {
            throw new UnsafeWorkspacePath(`${path} crosses a symbolic link or junction`);
        }
        if (index < segments.length - 1 && !info.isDirectory()) {
            throw new UnsafeWorkspacePath(`${path} crosses a non-directory component`);
        }
        if (index === segments.length - 1 && !info.isFile()) {
            throw new UnsafeWorkspacePath(`${path} is not a regular file`);
        }
    }
    await assertStillContained(root, path, absolute);
    return absolute;
}
async function assertStillContained(root, path, expected) {
    const rootReal = await realpath(root);
    const actual = await realpath(expected);
    if (!samePath(actual, expected) || !contained(rootReal, actual)) {
        throw new UnsafeWorkspacePath(`${path} resolves outside project_root`);
    }
}
async function lexical(root, path) {
    if (!path || path.includes("\0") || isAbsolute(path) || win32.isAbsolute(path)) {
        throw new UnsafeWorkspacePath("candidate paths must be relative");
    }
    const segments = path.replaceAll("\\", "/").split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
        throw new UnsafeWorkspacePath(`${path} contains an unsafe component`);
    }
    const rootReal = await realpath(root);
    const absolute = resolve(rootReal, ...segments);
    if (!contained(rootReal, absolute))
        throw new UnsafeWorkspacePath(`${path} escapes project_root`);
    return { absolute, rootReal, segments };
}
function contained(root, path) {
    const fromRoot = relative(root, path);
    return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}
function samePath(left, right) {
    return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function isMissing(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitArgs } from "../git.js";
import { digestContainedFile, readContainedFile } from "../filesystem.js";
const execFileAsync = promisify(execFile);
const MAX_SCAN_BYTES = 32 * 1_024 * 1_024;
const GIT_TIMEOUT_MS = 30_000;
export async function changedFiles(root) {
    let stdout;
    try {
        ;
        ({ stdout } = await execFileAsync("git", gitArgs(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]), { encoding: "utf8", maxBuffer: 64 * 1_024 * 1_024, shell: false, timeout: GIT_TIMEOUT_MS, windowsHide: true }));
    }
    catch {
        return null;
    }
    const entries = parseStatus(stdout);
    const files = [];
    for (const entry of entries) {
        files.push({ ...entry, digest: await digestContainedFile(root, entry.path) });
    }
    return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}
export function parseStatus(stdout) {
    const records = stdout.split("\0");
    const entries = [];
    for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (record === undefined || record.length < 4)
            continue;
        const status = record.slice(0, 2);
        const path = record.slice(3).replaceAll("\\", "/");
        if (!path)
            continue;
        if (status.includes("R")) {
            const origin = records[index + 1]?.replaceAll("\\", "/");
            if (origin) {
                entries.push({ kind: "added", path }, { kind: "deleted", path: origin });
                index += 1;
                continue;
            }
        }
        if (status.includes("C"))
            index += 1;
        entries.push({ kind: kindOf(status), path });
    }
    return entries;
}
function kindOf(status) {
    if (status === "??" || status.includes("A") || status.includes("C"))
        return "added";
    if (status.includes("D"))
        return "deleted";
    return "modified";
}
export async function readChangedContent(root, path) {
    const bytes = await readContainedFile(root, path, MAX_SCAN_BYTES);
    return bytes?.toString("utf8") ?? null;
}

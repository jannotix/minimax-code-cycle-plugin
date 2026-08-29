import { execFile } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { digestContainedFile, safeWritePath } from "../filesystem.js";
import { changedFiles } from "./changes.js";
import { gitArgs } from "../git.js";
const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;
export class DeliveryAborted extends Error {
    constructor(message) {
        super(message);
        this.name = "DeliveryAborted";
    }
}
const TEMPORARY_SUFFIX = ".cycle-delivery";
export async function promote(database, root, workflowId, candidateId, message, now = Date.now()) {
    const stored = loadManifest(database, candidateId);
    if (stored === null)
        throw new DeliveryAborted("this candidate has no recorded manifest");
    const manifest = {
        ...stored,
        evidenceIds: database
            .all("select id from evidence where candidate_id = ? order by gate_name", candidateId)
            .map((row) => String(row["id"])),
    };
    await assertUnchanged(root, manifest);
    journal(database, workflowId, candidateId, manifest, "prepared", null, now);
    return await write(database, root, workflowId, candidateId, manifest, now, message);
}
export async function recoverDelivery(database, root, workflowId, message, now = Date.now()) {
    const row = database.get("select * from deliveries where workflow_id = ? and state in ('prepared', 'written')", workflowId);
    if (row === undefined)
        return null;
    const candidateId = String(row["candidate_id"]);
    const manifest = JSON.parse(String(row["manifest"]));
    return await write(database, root, workflowId, candidateId, manifest, now, message);
}
export function deliveryOf(database, workflowId) {
    const row = database.get("select * from deliveries where workflow_id = ? order by updated_at desc limit 1", workflowId);
    if (row === undefined)
        return undefined;
    return {
        candidateId: String(row["candidate_id"]),
        reason: row["reason"] ?? null,
        state: String(row["state"]),
        written: JSON.parse(String(row["written"])),
    };
}
async function write(database, root, workflowId, candidateId, manifest, now, message) {
    const payloads = loadPayloads(database, candidateId);
    const delivered = [];
    const verifiedOnly = [];
    for (const file of manifest.files) {
        let target = await deliveryTarget(root, file.path);
        if (file.kind === "deleted") {
            await rm(target, { force: true });
            delivered.push(file.path);
            continue;
        }
        const bytes = payloads.get(file.path);
        if (bytes === undefined) {
            if ((await digestContainedFile(root, file.path)) !== file.digest) {
                throw new DeliveryAborted(`${file.path} was too large to keep and no longer matches the approved digest`);
            }
            verifiedOnly.push(file.path);
            continue;
        }
        await mkdir(dirname(target), { recursive: true });
        target = await deliveryTarget(root, file.path);
        const temporary = `${target}${TEMPORARY_SUFFIX}`;
        await writeFile(temporary, bytes);
        await rename(temporary, target);
        delivered.push(file.path);
        journal(database, workflowId, candidateId, manifest, "prepared", null, now, delivered);
    }
    journal(database, workflowId, candidateId, manifest, "written", null, now, delivered);
    for (const file of manifest.files) {
        await deliveryTarget(root, file.path);
        const actual = await digestContainedFile(root, file.path);
        const expected = file.kind === "deleted" ? null : file.digest;
        if (actual !== expected) {
            journal(database, workflowId, candidateId, manifest, "aborted", `${file.path} did not verify after delivery`, now, delivered);
            throw new DeliveryAborted(`${file.path} does not match the approved bytes after delivery`);
        }
    }
    const commit = await commitCandidate(root, manifest, message);
    journal(database, workflowId, candidateId, manifest, "completed", null, now, delivered);
    return {
        committed: commit.committed,
        delivered,
        reason: `${delivered.length} files delivered and re-verified, ` +
            `${commit.committed ? "committed as" : "already at"} ${commit.revision.slice(0, 12)}`,
        revision: commit.revision,
        state: "completed",
        verifiedOnly,
    };
}
export async function commitCandidate(root, manifest, message) {
    const paths = manifest.files.map((file) => file.path);
    if (paths.length === 0)
        throw new DeliveryAborted("there is nothing to commit");
    const pending = await git(root, ["status", "--porcelain=v1", "-z", "--", ...paths]);
    if (pending === null)
        throw new DeliveryAborted("the repository could not be read for the commit");
    if (pending.split("\0").filter(Boolean).length === 0) {
        const head = await git(root, ["rev-parse", "HEAD"]);
        if (head === null)
            throw new DeliveryAborted("the repository has no revision after delivery");
        return { committed: false, revision: head.trim() };
    }
    const present = manifest.files.filter((file) => file.kind !== "deleted").map((file) => file.path);
    const deleted = manifest.files.filter((file) => file.kind === "deleted").map((file) => file.path);
    if (present.length > 0) {
        const staged = await gitDetailed(root, ["add", "--", ...present]);
        if (!staged.ok) {
            throw new DeliveryAborted(`the delivered files could not be staged: ${staged.error || "git returned no detail"}`);
        }
    }
    if (deleted.length > 0) {
        const staged = await gitDetailed(root, [
            "update-index",
            "--remove",
            "--ignore-missing",
            "--",
            ...deleted,
        ]);
        if (!staged.ok) {
            throw new DeliveryAborted(`the delivered deletions could not be staged: ${staged.error || "git returned no detail"}`);
        }
    }
    const committed = await git(root, [
        "-c",
        "core.hooksPath=",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--only",
        "--no-verify",
        "--message",
        message,
        "--",
        ...paths,
    ]);
    if (committed === null) {
        throw new DeliveryAborted("the delivered files could not be committed; the approved bytes are on disk and verified. " +
            "The usual cause is a repository with no user.name or user.email configured.");
    }
    const head = await git(root, ["rev-parse", "HEAD"]);
    if (head === null)
        throw new DeliveryAborted("the commit did not produce a revision");
    return { committed: true, revision: head.trim() };
}
export function commitMessage(request, manifest, workflowId) {
    const subject = request.trim().split(/\r?\n/u)[0]?.trim() ?? "deliver approved candidate";
    return [
        subject.length > 72 ? `${subject.slice(0, 69)}...` : subject,
        "",
        `Delivered by Cycle against the original request, on ${manifest.evidenceIds.length} recorded ` +
            "gates and an independent arbitration.",
        "",
        `Base-revision: ${manifest.baseRevision}`,
        `Candidate-digest: ${manifest.candidateDigest}`,
        `Cycle-workflow: ${workflowId}`,
    ].join("\n");
}
async function git(root, args) {
    try {
        const { stdout } = await execFileAsync("git", gitArgs(root, args), {
            encoding: "utf8",
            maxBuffer: 64 * 1_024 * 1_024,
            shell: false,
            timeout: GIT_TIMEOUT_MS,
            windowsHide: true,
        });
        return stdout;
    }
    catch {
        return null;
    }
}
async function gitDetailed(root, args) {
    try {
        const { stdout } = await execFileAsync("git", gitArgs(root, args), {
            encoding: "utf8",
            maxBuffer: 64 * 1_024 * 1_024,
            shell: false,
            timeout: GIT_TIMEOUT_MS,
            windowsHide: true,
        });
        return { ok: true, stdout };
    }
    catch (error) {
        const detail = typeof error === "object" && error !== null && "stderr" in error
            ? String(error.stderr).trim().slice(0, 2_000)
            : error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
        return { error: detail, ok: false };
    }
}
async function assertUnchanged(root, manifest) {
    const head = (await git(root, ["rev-parse", "HEAD"]))?.trim() ?? null;
    if (head === null) {
        throw new DeliveryAborted("the base revision could not be read, so the candidate cannot be promoted");
    }
    if (head !== manifest.baseRevision) {
        throw new DeliveryAborted(`the base revision moved after approval: judged on ${manifest.baseRevision.slice(0, 12)}, ` +
            `now ${head.slice(0, 12)}`);
    }
    const current = await changedFiles(root);
    if (current === null) {
        throw new DeliveryAborted("the working tree could not be read, so the candidate cannot be compared");
    }
    const approved = new Map(manifest.files.map((file) => [file.path, file]));
    for (const file of current) {
        const match = approved.get(file.path);
        if (match === undefined) {
            throw new DeliveryAborted(`${file.path} changed after approval and is not part of the candidate`);
        }
        if (match.digest !== file.digest) {
            throw new DeliveryAborted(`${file.path} changed after approval`);
        }
    }
}
function journal(database, workflowId, candidateId, manifest, state, reason, now, written = []) {
    database.run(`insert into deliveries (candidate_id, workflow_id, state, manifest, written, reason, started_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (candidate_id) do update set
       state = excluded.state, written = excluded.written,
       reason = excluded.reason, updated_at = excluded.updated_at`, candidateId, workflowId, state, JSON.stringify(manifest), JSON.stringify([...written]), reason, now, now);
}
function loadManifest(database, candidateId) {
    const row = database.get("select manifest from candidates where id = ?", candidateId);
    if (row === undefined)
        return null;
    try {
        const parsed = JSON.parse(String(row["manifest"]));
        return Array.isArray(parsed.files) ? parsed : null;
    }
    catch {
        return null;
    }
}
function loadPayloads(database, candidateId) {
    const rows = database.all("select path, payload from candidate_files where candidate_id = ? and payload is not null", candidateId);
    return new Map(rows.map((row) => [String(row["path"]), row["payload"]]));
}
async function deliveryTarget(root, path) {
    try {
        return await safeWritePath(root, path);
    }
    catch (error) {
        throw new DeliveryAborted(error instanceof Error ? error.message : String(error));
    }
}

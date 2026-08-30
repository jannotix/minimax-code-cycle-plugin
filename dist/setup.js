import { createHash } from "node:crypto";
import { containsSecret } from "./secrets.js";
export const SETUP_SCHEMA = "cycle.mavis-setup.v1";
export const SETUP_NAMESPACE = "cycle-v2";
export const SETUP_OWNER = "minimax-code-cycle-plugin";
export const ROLE_SETUP = [
    {
        access: "read_only",
        agentName: "cycle-v2-architect",
        description: "Plans a Cycle change as a requirement matrix and scoped acyclic task graph; never implements or approves.",
        displayName: "Cycle Architect",
        promptPath: "skills/cycle/roles/architect.md",
        role: "architect",
    },
    {
        access: "executor",
        agentName: "cycle-v2-executor",
        description: "Implements one authorized Cycle task inside its declared write scopes; never approves its own work.",
        displayName: "Cycle Executor",
        promptPath: "skills/cycle/roles/executor.md",
        role: "executor",
    },
    {
        access: "read_only",
        agentName: "cycle-v2-functional-reviewer",
        description: "Independently reviews a frozen Cycle candidate for completeness, regressions, and end-to-end behavior.",
        displayName: "Cycle Functional Reviewer",
        promptPath: "skills/cycle/roles/functional-reviewer.md",
        role: "functional_reviewer",
    },
    {
        access: "read_only",
        agentName: "cycle-v2-security-reviewer",
        description: "Independently reviews a frozen Cycle candidate for security, trust boundaries, and architecture.",
        displayName: "Cycle Security Reviewer",
        promptPath: "skills/cycle/roles/security-reviewer.md",
        role: "security_reviewer",
    },
    {
        access: "read_only",
        agentName: "cycle-v2-arbiter",
        description: "Issues the final evidence-bound Cycle decision against the immutable original request; never edits files.",
        displayName: "Cycle Arbiter",
        promptPath: "skills/cycle/roles/arbiter.md",
        role: "arbiter",
    },
];
export function roleSetup(role) {
    const found = ROLE_SETUP.find((entry) => entry.role === role);
    if (found === undefined)
        throw new Error(`unknown Cycle setup role: ${role}`);
    return found;
}
export function ownershipMarker(role) {
    return `<!-- cycle-managed:${SETUP_OWNER};schema=${SETUP_SCHEMA};role=${role} -->`;
}
export function managedSystemPrompt(role, body) {
    const prompt = normalize(body);
    if (!prompt)
        throw new Error(`the ${role} prompt is empty`);
    return `${ownershipMarker(role)}\n\n${prompt}`;
}
export function contentDigest(content) {
    return createHash("sha256").update(normalize(content)).digest("hex");
}
export function byteDigest(content) {
    return createHash("sha256").update(content).digest("hex");
}
export function assessAgent(role, expectedBody, observed) {
    const expected = roleSetup(role);
    if (observed === undefined)
        return { action: "create", reason: "managed agent is absent" };
    if (observed.name !== expected.agentName) {
        return { action: "conflict", reason: "native agent lookup returned a different name" };
    }
    if (!normalize(observed.systemPrompt).startsWith(ownershipMarker(role))) {
        return { action: "conflict", reason: "agent name is owned by a non-Cycle prompt" };
    }
    const wantedPrompt = managedSystemPrompt(role, expectedBody);
    if (normalize(observed.systemPrompt) === normalize(wantedPrompt) &&
        normalize(observed.description) === normalize(expected.description)) {
        return { action: "noop", reason: "agent already matches the managed specification" };
    }
    return { action: "update", reason: "managed prompt or description is stale" };
}
export function assessUninstall(role, observed) {
    if (observed === undefined)
        return { action: "noop", reason: "managed agent is already absent" };
    const expected = roleSetup(role);
    if (observed.name !== expected.agentName || !normalize(observed.systemPrompt).startsWith(ownershipMarker(role))) {
        return { action: "conflict", reason: "refusing to delete an agent not owned by this Cycle setup" };
    }
    return { action: "delete", reason: "managed Cycle agent may be removed" };
}
export function validateSetupReceipt(raw, pluginVersion) {
    const root = exactRecord(raw, ["agents", "pluginVersion", "profile", "schema", "status"], "receipt");
    if (root["schema"] !== "cycle.mavis-setup-receipt.v1")
        throw new Error("invalid setup receipt schema");
    if (root["pluginVersion"] !== pluginVersion)
        throw new Error("setup receipt plugin version is stale");
    const profile = boundedText(root["profile"], "profile", 128);
    if (/[\\/:]/u.test(profile) || containsSecret(profile))
        throw new Error("profile must be a sanitized name");
    if (!Array.isArray(root["agents"]) || root["agents"].length !== ROLE_SETUP.length) {
        throw new Error("setup receipt must contain exactly five agents");
    }
    const agents = root["agents"].map((entry, index) => receiptAgent(entry, ROLE_SETUP[index]));
    const status = root["status"];
    if (!["blocked", "installed_unverified", "ready", "uninstalled"].includes(status)) {
        throw new Error("invalid setup receipt status");
    }
    const allNative = agents.every((entry) => entry.nativeVerified);
    const allOffline = agents.every((entry) => entry.hookOfflineVerified);
    const allLive = agents.every((entry) => entry.hookLiveVerified);
    const allAbsent = agents.every((entry) => !entry.nativeVerified && !entry.hookOfflineVerified && !entry.hookLiveVerified);
    if (status === "ready" && !(allNative && allOffline && allLive)) {
        throw new Error("ready requires native, offline-hook, and live-hook verification for every role");
    }
    if (status === "installed_unverified" && !(allNative && allOffline && !allLive)) {
        throw new Error("installed_unverified requires native/offline verification and an incomplete live gate");
    }
    if (status === "uninstalled" && !allAbsent) {
        throw new Error("uninstalled requires every managed agent and hook verification to be absent");
    }
    return {
        agents,
        pluginVersion,
        profile,
        schema: "cycle.mavis-setup-receipt.v1",
        status: status,
    };
}
function receiptAgent(raw, expected) {
    const entry = exactRecord(raw, [
        "effectiveModel",
        "hookDigest",
        "hookLiveVerified",
        "hookOfflineVerified",
        "modelSource",
        "name",
        "nativeVerified",
        "role",
    ], `receipt ${expected.role}`);
    if (entry["role"] !== expected.role || entry["name"] !== expected.agentName) {
        throw new Error(`setup receipt role/name mismatch at ${expected.role}`);
    }
    const rawModel = entry["effectiveModel"];
    let effectiveModel = null;
    if (rawModel !== null) {
        effectiveModel = boundedText(rawModel, `${expected.role} effectiveModel`, 256);
        if (containsSecret(effectiveModel))
            throw new Error("effective model contains a secret shape");
    }
    const modelSource = entry["modelSource"];
    if (modelSource !== "session-inherited" && modelSource !== "native-agent") {
        throw new Error(`invalid model source for ${expected.role}`);
    }
    const hookDigest = boundedText(entry["hookDigest"], `${expected.role} hookDigest`, 64);
    if (!/^[a-f0-9]{64}$/u.test(hookDigest))
        throw new Error(`invalid hook digest for ${expected.role}`);
    for (const key of ["nativeVerified", "hookOfflineVerified", "hookLiveVerified"]) {
        if (typeof entry[key] !== "boolean")
            throw new Error(`${expected.role} ${key} must be boolean`);
    }
    return {
        effectiveModel,
        hookDigest,
        hookLiveVerified: entry["hookLiveVerified"],
        hookOfflineVerified: entry["hookOfflineVerified"],
        modelSource,
        name: expected.agentName,
        nativeVerified: entry["nativeVerified"],
        role: expected.role,
    };
}
function exactRecord(raw, keys, label) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        throw new Error(`${label} must be an object`);
    const record = raw;
    const actual = Object.keys(record).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new Error(`${label} has unexpected or missing keys`);
    }
    return record;
}
function boundedText(raw, label, maximum) {
    if (typeof raw !== "string" || !raw.trim() || Buffer.byteLength(raw, "utf8") > maximum) {
        throw new Error(`${label} must be non-empty text of at most ${maximum} bytes`);
    }
    return raw.trim();
}
function normalize(value) {
    return value.replaceAll("\r\n", "\n").trim();
}

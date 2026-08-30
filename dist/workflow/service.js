import { release } from "../admission.js";
import { parseSnapshot } from "../evidence/accessibility.js";
import { browserEvidence } from "../evidence/browser.js";
import { captureCandidate } from "../evidence/candidate.js";
import { changedFiles } from "../evidence/changes.js";
import { commitMessage, DeliveryAborted, promote, recoverDelivery, } from "../evidence/delivery.js";
import { verify as verifyEvidence } from "../evidence/engine.js";
import { proofEvidence, proofGateName } from "../evidence/proof-evidence.js";
import { runProof } from "../evidence/proof.js";
import { advanceGoalOfWorkflow, linkStartedWorkflow } from "../goals.js";
import { captureBlocked, captureDelivery } from "../memory.js";
import { issueCaptureCapabilities, redeemCaptureCapability } from "../store/capabilities.js";
import { signCheckpoint } from "../store/checkpoints.js";
import { loadEvidence, recordEvidence } from "../store/evidence.js";
import { goalOfWorkflow } from "../store/goals.js";
import { appendHistory } from "../store/history.js";
import { newId } from "../store/ids.js";
import { bindRoleSession, candidateReviewerSessions, roleSessions, } from "../store/role-sessions.js";
import { activeWorkflowForRequest, candidateManifest, createWorkflow, frozenFiles, lastRefusal, latestWorkflow, loadPlan, loadRequest, loadReviews, loadTasks, loadWorkflow, recordArbitration, recordCandidate, requestDigestOf, savePlan, saveWorkflow, setTaskState, submitReview, } from "../store/workflows.js";
import { apply, isTerminal, TransitionError } from "./machine.js";
import { parsePlan } from "./plan.js";
import { route } from "./routing.js";
import { insideAny } from "./scopes.js";
import { parseVerdict } from "./verdicts.js";
export class WorkflowError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowError";
    }
}
export function bindWorkflowRoleSession(runtime, projectRoot, workflowId, role, roleSessionId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    const allowed = {
        architect: ["architecture"],
        executor: ["execution", "quick_execution"],
        functional_reviewer: ["independent_reviews"],
        security_reviewer: ["independent_reviews", "arbitration"],
        arbiter: ["arbitration"],
    };
    if (!allowed[role].includes(workflow.state)) {
        throw new WorkflowError(`${role} session cannot bind while workflow is ${workflow.state}`);
    }
    const candidateId = role === "functional_reviewer" || role === "security_reviewer" || role === "arbiter"
        ? requireCandidate(workflow)
        : null;
    const existing = roleSessions(database, workflow.id).some((entry) => entry.role === role && entry.sessionId === roleSessionId);
    const binding = bindRoleSession(database, workflow.id, candidateId, role, roleSessionId, now);
    if (!existing) {
        record(database, workflow, "role.session_bound", { role }, now, role, roleSessionId);
    }
    return { binding, state: workflow.state };
}
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_AMENDMENT_BYTES = 64 * 1024;
const MAX_REASON_BYTES = 4 * 1024;
export function startWorkflow(runtime, input, now = Date.now()) {
    if (!input.request.trim())
        throw new WorkflowError("request must not be empty");
    if (Buffer.byteLength(input.request, "utf8") > MAX_REQUEST_BYTES) {
        throw new WorkflowError(`request exceeds the ${MAX_REQUEST_BYTES}-byte limit`);
    }
    if (/^request\s*=/iu.test(input.request.trim())) {
        throw new WorkflowError("request must contain the user's text, not a serialized argument list");
    }
    const preference = input.preference ?? "auto";
    if (!["auto", "full", "quick"].includes(preference)) {
        throw new WorkflowError("preference must be auto, full, or quick");
    }
    const project = runtime.project(input.projectRoot);
    const database = runtime.requireStore();
    const requestDigest = requestDigestOf(input.request);
    const existing = activeWorkflowForRequest(database, project.id, requestDigest);
    if (existing !== undefined)
        return view(database, existing, true);
    return database.transaction(() => {
        const created = createWorkflow(database, project.id, input.request, runtime.configuration.maxRepairCycles, now);
        let workflow = requireWorkflow(database, project.id, created.id);
        const goalId = linkStartedWorkflow({ database, projectId: project.id }, workflow.id, input.request, now);
        record(database, workflow, "workflow.started", {
            ...(goalId === null ? {} : { goalId }),
            requestDigest: created.requestDigest,
        }, now);
        workflow = transition(database, workflow, { type: "complete_intake" }, now);
        const decision = route(input.request, input.affectedPaths ?? [], preference);
        workflow = transition(database, workflow, { mode: decision.mode, type: "route" }, now, {
            critical: decision.critical.join(","),
            rationale: decision.rationale,
            userPromoted: String(decision.userPromoted),
        });
        return { ...view(database, workflow, false), routing: decision };
    });
}
export function workflowStatus(runtime, projectRoot, workflowId) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = workflowId
        ? loadWorkflow(database, workflowId)
        : latestWorkflow(database, project.id);
    if (workflow === undefined)
        return null;
    if (workflow.projectId !== project.id)
        throw new WorkflowError("workflow does not belong to project_root");
    return view(database, workflow, false);
}
export function amendWorkflow(runtime, projectRoot, workflowId, amendment, now = Date.now()) {
    if (!amendment.trim())
        throw new WorkflowError("amendment must not be empty");
    if (Buffer.byteLength(amendment, "utf8") > MAX_AMENDMENT_BYTES) {
        throw new WorkflowError(`amendment exceeds the ${MAX_AMENDMENT_BYTES}-byte limit`);
    }
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    database.transaction(() => {
        const current = loadRequest(database, workflow.id);
        if (current === undefined)
            throw new WorkflowError("request not found");
        const amendments = [
            ...current.amendments,
            { receivedAt: now, sequence: current.amendments.length + 1, text: amendment },
        ];
        database.run("update requests set amendments = ? where workflow_id = ?", JSON.stringify(amendments), workflow.id);
        record(database, workflow, "request.amended", { amendment }, now, "coordinator");
    });
    return view(database, workflow, false);
}
export function submitPlan(runtime, projectRoot, workflowId, raw, roleSessionId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "architecture") {
        throw new WorkflowError(`a plan is only accepted in architecture, not ${workflow.state}`);
    }
    bindRoleSession(database, workflow.id, null, "architect", roleSessionId, now);
    const plan = parsePlan(raw);
    return database.transaction(() => {
        savePlan(database, workflow.id, plan, now);
        const next = transition(database, workflow, { type: "architecture_accepted" }, now);
        record(database, next, "architecture.accepted", {
            requirements: String(plan.requirements.length),
            tasks: String(plan.tasks.length),
        }, now, "architect", roleSessionId);
        return {
            requirements: plan.requirements.map((entry) => entry.id),
            state: next.state,
            tasks: plan.tasks.map((task) => ({ key: task.key, writeScopes: task.writeScopes })),
        };
    });
}
export async function reportTask(runtime, projectRoot, workflowId, key, status, summary, roleSessionId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "execution" && workflow.state !== "quick_execution") {
        throw new WorkflowError(`a task is reported during execution, not ${workflow.state}`);
    }
    bindRoleSession(database, workflow.id, null, "executor", roleSessionId, now);
    const tasks = loadTasks(database, workflow.id);
    const task = tasks.find((entry) => entry.key === key);
    if (tasks.length > 0 && task === undefined)
        throw new WorkflowError(`unknown task: ${key}`);
    const changed = await changedFiles(project.path);
    if (changed === null) {
        record(database, workflow, "execution.change_set_unreadable", { task: key }, now, "executor", roleSessionId);
        return { reason: "the change set could not be read; task completion was not recorded", retry: true };
    }
    const changedPaths = changed.map((entry) => entry.path);
    if (status === "completed") {
        const violations = outOfScope(database, workflow.id, key, changedPaths);
        if (violations.length > 0) {
            if (task !== undefined)
                setTaskState(database, workflow.id, key, "blocked", now);
            record(database, workflow, "execution.scope_violation", {
                paths: violations.slice(0, 20).join(", "),
                task: key,
            }, now, "executor", roleSessionId);
            const next = transition(database, workflow, { target: "execution", type: "execution_failed" }, now);
            return { outOfScope: violations, state: next.state };
        }
    }
    if (task !== undefined)
        setTaskState(database, workflow.id, key, status, now);
    record(database, workflow, `execution.task_${status}`, {
        summary: summary.slice(0, 2_000),
        task: key,
    }, now, "executor", roleSessionId);
    if (status === "plan_defect") {
        const next = workflow.state === "execution"
            ? transition(database, workflow, { type: "replan" }, now)
            : transition(database, workflow, { target: "architecture", type: "execution_failed" }, now);
        return { changedPaths, state: next.state };
    }
    if (status === "blocked") {
        const next = transition(database, workflow, { target: "execution", type: "execution_failed" }, now);
        return { changedPaths, state: next.state };
    }
    return { changedPaths, state: workflow.state };
}
export async function freezeWorkflowCandidate(runtime, projectRoot, workflowId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "execution" && workflow.state !== "quick_execution") {
        throw new WorkflowError(`candidate freeze is accepted during execution, not ${workflow.state}`);
    }
    const tasks = loadTasks(database, workflow.id);
    if (workflow.mode === "full" && (tasks.length === 0 || tasks.some((task) => task.state !== "completed"))) {
        throw new WorkflowError("every planned task must be completed before candidate freeze");
    }
    const captured = await captureCandidate(project.path);
    const candidateId = newId();
    return database.transaction(() => {
        const candidateDigest = recordCandidate(database, workflow.id, candidateId, captured, now);
        const next = transition(database, workflow, { candidateId, type: "candidate_ready" }, now);
        record(database, next, "candidate.frozen", {
            baseRevision: captured.manifest.baseRevision,
            candidateId,
            digest: candidateDigest,
            files: String(captured.manifest.files.length),
        }, now);
        return {
            baseRevision: captured.manifest.baseRevision,
            candidateDigest,
            candidateId,
            captureCapabilities: issueCaptureCapabilities(database, workflow.id, candidateId, now),
            files: captured.manifest.files.length,
            state: next.state,
        };
    });
}
export async function verifyWorkflowCandidate(runtime, projectRoot, workflowId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "verification") {
        throw new WorkflowError(`verification is only accepted in verification, not ${workflow.state}`);
    }
    const candidateId = requireCandidate(workflow);
    const outcome = await verifyEvidence({
        candidateId,
        database,
        projectId: project.id,
        root: project.path,
        strictness: runtime.configuration.gateStrictness,
        taskCommands: loadTasks(database, workflow.id).flatMap((task) => task.verificationCommands),
    });
    return database.transaction(() => {
        record(database, workflow, "verification.completed", {
            mandatoryPassed: String(outcome.mandatoryPassed),
            reason: outcome.reason,
        }, now);
        const next = outcome.mandatoryPassed
            ? transition(database, workflow, { type: "verification_passed" }, now)
            : transition(database, workflow, { target: "execution", type: "verification_failed" }, now);
        const memoryId = rememberIfBlocked(database, next, workflow.candidateId, now);
        return { ...outcome, memoryId, state: next.state };
    });
}
export function candidateEvidence(runtime, projectRoot, workflowId) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    const requirements = loadPlan(database, workflow.id)?.requirements.map((entry) => entry.id) ?? [];
    if (workflow.candidateId === null)
        return { candidate: null, evidence: [], requirements };
    return {
        candidate: workflow.candidateId,
        evidence: loadEvidence(database, workflow.candidateId).map((item) => ({
            gate: item.gateName,
            id: item.id,
            mandatory: item.mandatory,
            reason: item.skipReason,
            status: item.status,
        })),
        requirements,
    };
}
export function submitReviewVerdict(runtime, projectRoot, workflowId, role, raw, roleSessionId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "independent_reviews") {
        throw new WorkflowError(`a review is only accepted in independent_reviews, not ${workflow.state}`);
    }
    const candidateId = requireCandidate(workflow);
    bindRoleSession(database, workflow.id, candidateId, role, roleSessionId, now);
    const verdict = parseVerdict(raw, verdictContext(database, workflow, role));
    const { reviewsReady } = submitReview(database, workflow.id, candidateId, role, verdict, now);
    record(database, workflow, "review.submitted", { decision: verdict.decision, role }, now, role, roleSessionId);
    const next = reviewsReady
        ? transition(database, workflow, { type: "reviews_ready" }, now)
        : workflow;
    return { decision: verdict.decision, reviewsReady, state: next.state };
}
export function submitBrowserEvidence(runtime, projectRoot, workflowId, raw, roleSessionId, captureToken = null, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "verification" && workflow.state !== "independent_reviews") {
        throw new WorkflowError(`browser evidence is not accepted in ${workflow.state}`);
    }
    const candidateId = requireCandidate(workflow);
    let capturedBy = "executor";
    if (captureToken !== null) {
        const redeemed = redeemCaptureCapability(database, candidateId, captureToken, now);
        if (redeemed.role === null)
            throw new WorkflowError(`capture capability is ${redeemed.reason}`);
        capturedBy = redeemed.role;
    }
    bindRoleSession(database, workflow.id, capturedBy === "executor" ? null : candidateId, capturedBy, roleSessionId, now);
    const snapshot = parseSnapshot(raw);
    const { evidence, findings } = browserEvidence(snapshot, capturedBy, now);
    recordEvidence(database, candidateId, evidence, (item) => item.gate.mandatory);
    record(database, workflow, "browser.captured", {
        capturedBy,
        findings: String(findings.length),
        flow: snapshot.capturedFlow.slice(0, 200),
    }, now, capturedBy, roleSessionId);
    return { accessibility: findings, capturedBy, evidenceIds: evidence.map((item) => item.id) };
}
export async function submitSecurityProof(runtime, projectRoot, workflowId, request, roleSessionId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "independent_reviews" && workflow.state !== "arbitration") {
        throw new WorkflowError(`a proof is run while the candidate is under review, not ${workflow.state}`);
    }
    if (!runtime.configuration.securityProofs) {
        throw new WorkflowError("executing security proofs is off; set CYCLE_SECURITY_PROOFS=on deliberately");
    }
    const candidateId = requireCandidate(workflow);
    bindRoleSession(database, workflow.id, candidateId, "security_reviewer", roleSessionId, now);
    const rationale = request.rationale.trim().slice(0, 2_000);
    if (!rationale)
        throw new WorkflowError("a proof must state its rationale");
    const result = await runProof(project.path, {
        ...(request.command === undefined ? {} : { command: request.command }),
        ...(request.interpreter === undefined ? {} : { interpreter: request.interpreter }),
        ...(request.script === undefined ? {} : { script: request.script }),
    });
    const evidence = proofEvidence(request.vulnerabilityClass, rationale, result, now);
    recordEvidence(database, candidateId, [evidence], (item) => item.gate.mandatory);
    record(database, workflow, `security.proof_${result.demonstrated ? "demonstrated" : "inconclusive"}`, {
        gate: proofGateName(request.vulnerabilityClass),
        rationale,
    }, now, "security_reviewer", roleSessionId);
    return {
        containment: result.containment,
        demonstrated: result.demonstrated,
        evidenceId: evidence.id,
        exitCode: evidence.exitCode,
        output: evidence.output.slice(0, 8_000),
        status: evidence.status,
    };
}
export function mandatoryGatesPassed(runtime, projectRoot, workflowId) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    requireWorkflow(database, project.id, workflowId);
    const row = database.get(`select count(*) as total, sum(case when e.status != 'passed' then 1 else 0 end) as failed
       from evidence e join workflows w on w.candidate_id = e.candidate_id
      where w.id = ? and e.mandatory = 1`, workflowId);
    return (row?.total ?? 0) > 0 && (row?.failed ?? 0) === 0;
}
export function arbitrateWorkflow(runtime, projectRoot, workflowId, raw, roleSessionId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "arbitration") {
        throw new WorkflowError(`arbitration is only accepted in arbitration, not ${workflow.state}`);
    }
    const candidateId = requireCandidate(workflow);
    bindRoleSession(database, workflow.id, candidateId, "arbiter", roleSessionId, now);
    const verdict = parseVerdict(raw, verdictContext(database, workflow, "arbiter"));
    if (workflow.mode === "full") {
        const reviews = loadReviews(database, candidateId);
        if (reviews.length < 2)
            throw new WorkflowError("arbitration requires both independent reviews");
        if (candidateReviewerSessions(database, workflow.id, candidateId) === null) {
            throw new WorkflowError("arbitration requires two distinct native reviewer sessions");
        }
        if (verdict.decision === "approved" && reviews.some((review) => review.verdict.decision === "rejected")) {
            throw new WorkflowError("arbitration cannot approve while a reviewer rejected the candidate");
        }
    }
    return database.transaction(() => {
        const receiptDigest = recordArbitration(database, workflow.id, candidateId, verdict, now);
        let next;
        let refusal = null;
        if (verdict.decision === "approved") {
            try {
                next = transition(database, workflow, { mandatoryGatesPassed: mandatoryGatesPassed(runtime, project.path, workflow.id), type: "approve" }, now);
            }
            catch (error) {
                if (!(error instanceof TransitionError) || error.code !== "gates_not_passed")
                    throw error;
                refusal = error.message;
                next = transition(database, workflow, { target: "execution", type: "reject" }, now);
            }
        }
        else {
            next = transition(database, workflow, { target: verdict.repairTarget ?? "execution", type: "reject" }, now);
        }
        const memoryId = rememberIfBlocked(database, next, candidateId, now);
        record(database, next, `arbitration.${refusal === null ? verdict.decision : "refused"}`, {
            receiptDigest,
            ...(memoryId === null ? {} : { memoryId }),
            ...(refusal === null ? {} : { refusal }),
        }, now, "arbiter", roleSessionId);
        return {
            decision: verdict.decision,
            memoryId,
            receiptDigest,
            refusal,
            repair: { max: next.maxRepairCycles, used: next.repairCycles },
            state: next.state,
        };
    });
}
export async function deliverWorkflowCandidate(runtime, projectRoot, workflowId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = requireWorkflow(database, project.id, workflowId);
    if (workflow.state !== "delivery") {
        throw new WorkflowError(`delivery is only accepted in delivery, not ${workflow.state}`);
    }
    const candidateId = requireCandidate(workflow);
    let outcome;
    try {
        outcome = await promote(database, project.path, workflow.id, candidateId, deliveryMessage(database, workflow, candidateId), now);
    }
    catch (error) {
        if (!(error instanceof DeliveryAborted))
            throw error;
        record(database, workflow, "delivery.aborted", { reason: error.message }, now);
        return { aborted: error.message, state: workflow.state };
    }
    const { goal, learned, next } = database.transaction(() => {
        const next = transition(database, workflow, { type: "deliver" }, now);
        const learned = captureDelivery({ database, projectId: project.id }, {
            candidateId,
            files: outcome.delivered,
            request: loadRequest(database, workflow.id)?.originalText ?? "",
            revision: outcome.revision,
            workflowId: workflow.id,
        }, now);
        const goal = advanceGoalOfWorkflow({ database, projectId: project.id }, workflow.id, now);
        record(database, next, "delivery.completed", {
            files: String(outcome.delivered.length),
            ...(goal === null ? {} : { goalId: goal.goalId, goalBlocked: String(goal.blocked) }),
            memories: String(learned.length),
            revision: outcome.revision,
            verifiedOnly: String(outcome.verifiedOnly.length),
        }, now);
        return { goal, learned, next };
    });
    signCheckpoint(database, runtime.dataDirectory, now);
    return { ...outcome, goal, memories: learned, state: next.state };
}
export async function reconcileWorkflow(runtime, projectRoot, workflowId, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    const workflow = workflowId === undefined
        ? latestWorkflow(database, project.id)
        : loadWorkflow(database, workflowId);
    if (workflow === undefined || workflow.projectId !== project.id)
        return { found: false };
    if (workflow.state === "delivery") {
        const candidateId = requireCandidate(workflow);
        const recovered = await recoverDelivery(database, project.path, workflow.id, deliveryMessage(database, workflow, candidateId), now);
        if (recovered !== null) {
            const { goal, learned, next } = database.transaction(() => {
                const next = transition(database, workflow, { type: "deliver" }, now);
                const learned = captureDelivery({ database, projectId: project.id }, {
                    candidateId,
                    files: recovered.delivered,
                    request: loadRequest(database, workflow.id)?.originalText ?? "",
                    revision: recovered.revision,
                    workflowId: workflow.id,
                }, now);
                const goal = advanceGoalOfWorkflow({ database, projectId: project.id }, workflow.id, now);
                record(database, next, "delivery.recovered", {
                    files: String(recovered.delivered.length),
                    ...(goal === null ? {} : { goalId: goal.goalId, goalBlocked: String(goal.blocked) }),
                    memories: String(learned.length),
                    revision: recovered.revision,
                }, now);
                return { goal, learned, next };
            });
            signCheckpoint(database, runtime.dataDirectory, now);
            return { found: true, goal, memories: learned, recovered, state: next.state };
        }
    }
    return { found: true, state: workflow.state, workflowId: workflow.id };
}
export function controlWorkflow(runtime, projectRoot, workflowId, operation, options = {}, now = Date.now()) {
    const project = runtime.project(projectRoot);
    const database = runtime.requireStore();
    let workflow = requireWorkflow(database, project.id, workflowId);
    if (Buffer.byteLength(options.reason ?? "", "utf8") > MAX_REASON_BYTES) {
        throw new WorkflowError(`reason exceeds the ${MAX_REASON_BYTES}-byte limit`);
    }
    let command;
    switch (operation) {
        case "pause":
            command = { type: "pause" };
            break;
        case "resume":
            command = { type: "resume" };
            break;
        case "retry":
            command = workflow.state === "blocked"
                ? { additionalCycles: options.additionalCycles ?? 1, type: "resume_blocked" }
                : { type: "begin_repair" };
            break;
        case "cancel":
            if (options.confirm !== true)
                throw new WorkflowError("cancel requires confirm: true");
            command = { type: "cancel" };
            break;
    }
    workflow = database.transaction(() => {
        const moved = transition(database, workflow, command, now, { reason: options.reason ?? "" });
        if (operation === "cancel")
            signCheckpoint(database, runtime.dataDirectory, now);
        return moved;
    });
    return view(database, workflow, false);
}
export function requireProjectWorkflow(runtime, projectRoot, workflowId) {
    const project = runtime.project(projectRoot);
    return requireWorkflow(runtime.requireStore(), project.id, workflowId);
}
function outOfScope(database, workflowId, key, changedPaths) {
    const tasks = loadTasks(database, workflowId);
    if (tasks.length === 0)
        return [];
    const authorized = tasks
        .filter((task) => task.key === key || task.state === "completed")
        .flatMap((task) => task.writeScopes);
    return changedPaths.filter((path) => !insideAny(path, authorized)).sort();
}
function verdictContext(database, workflow, role) {
    const plan = loadPlan(database, workflow.id);
    const evidence = database.all("select e.id from evidence e join workflows w on w.candidate_id = e.candidate_id where w.id = ?", workflow.id);
    const proofIds = loadEvidence(database, workflow.candidateId ?? "")
        .filter((item) => item.gateName.startsWith("security:proof:") && item.status === "failed")
        .map((item) => item.id);
    return {
        evidenceIds: evidence.map((row) => row.id),
        proofIds,
        requirementIds: plan?.requirements.map((entry) => entry.id) ?? [],
        requiresProof: role === "security_reviewer",
        role,
    };
}
function deliveryMessage(database, workflow, candidateId) {
    const request = loadRequest(database, workflow.id)?.originalText ?? "deliver approved candidate";
    const manifest = candidateManifest(database, candidateId);
    if (manifest === undefined)
        throw new WorkflowError("candidate manifest not found");
    return commitMessage(request, manifest, workflow.id);
}
function rememberIfBlocked(database, workflow, candidateId, now) {
    if (workflow.state !== "blocked" || candidateId === null)
        return null;
    return captureBlocked({ database, projectId: workflow.projectId }, {
        candidateId,
        cycles: workflow.repairCycles,
        files: frozenFiles(database, candidateId).map((file) => file.path),
        request: loadRequest(database, workflow.id)?.originalText ?? "",
        workflowId: workflow.id,
    }, now);
}
function transition(database, workflow, command, now, metadata = {}) {
    return database.transaction(() => {
        const before = workflow.state;
        const after = apply(workflow, command);
        const moved = { ...workflow, ...after, updatedAt: now };
        saveWorkflow(database, moved, now);
        record(database, moved, "workflow.transition", {
            command: command.type,
            from: before,
            to: moved.state,
            ...metadata,
        }, now);
        if (isTerminal(moved.state) || moved.state === "blocked" || moved.state === "paused") {
            release(database, moved.id);
        }
        return moved;
    });
}
function requireWorkflow(database, projectId, workflowId) {
    const workflow = loadWorkflow(database, workflowId);
    if (workflow === undefined)
        throw new WorkflowError("workflow not found");
    if (workflow.projectId !== projectId)
        throw new WorkflowError("workflow does not belong to project_root");
    return workflow;
}
function requireCandidate(workflow) {
    if (workflow.candidateId === null)
        throw new WorkflowError("workflow has no candidate");
    return workflow.candidateId;
}
function record(database, workflow, action, metadata, now, role = "system", sessionId = null) {
    appendHistory(database, {
        action,
        actor: "cycle-control-plane",
        candidateId: workflow.candidateId,
        metadata,
        projectId: workflow.projectId,
        role,
        sessionId,
        workflowId: workflow.id,
    }, now);
}
function view(database, workflow, deduplicated) {
    return {
        deduplicated,
        goalId: goalOfWorkflow(database, workflow.id) ?? null,
        lastRefusal: lastRefusal(database, workflow.id),
        request: loadRequest(database, workflow.id),
        reviews: workflow.candidateId === null ? [] : loadReviews(database, workflow.candidateId),
        roleSessions: roleSessions(database, workflow.id),
        tasks: loadTasks(database, workflow.id),
        workflow,
    };
}

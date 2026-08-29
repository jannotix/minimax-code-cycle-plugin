import { DIGEST_DOMAIN, digest, newId } from "./ids.js";
export function createWorkflow(database, projectId, originalText, maxRepairCycles, now) {
    const id = newId();
    const requestDigest = requestDigestOf(originalText);
    database.transaction(() => {
        database.run(`insert into workflows (id, project_id, state, max_repair_cycles, created_at, updated_at)
       values (?, ?, 'intake', ?, ?, ?)`, id, projectId, maxRepairCycles, now, now);
        database.run("insert into requests (workflow_id, original_text, digest, created_at) values (?, ?, ?, ?)", id, originalText, requestDigest, now);
    });
    return { id, requestDigest };
}
export function requestDigestOf(originalText) {
    return digest(DIGEST_DOMAIN.request, { attachments: [], text: originalText });
}
export function activeWorkflowForRequest(database, projectId, requestDigest) {
    const row = database.get(`select workflows.* from workflows
       join requests on requests.workflow_id = workflows.id
      where workflows.project_id = ? and requests.digest = ?
        and workflows.state not in ('cancelled', 'completed')
      order by workflows.created_at desc limit 1`, projectId, requestDigest);
    return row === undefined ? undefined : toWorkflow(row);
}
export function loadWorkflow(database, id) {
    const row = database.get("select * from workflows where id = ?", id);
    return row === undefined ? undefined : toWorkflow(row);
}
export function latestWorkflow(database, projectId) {
    const row = database.get("select * from workflows where project_id = ? order by updated_at desc limit 1", projectId);
    return row === undefined ? undefined : toWorkflow(row);
}
export function saveWorkflow(database, workflow, now) {
    database.run(`update workflows set state = ?, mode = ?, candidate_id = ?, repair_target = ?,
       repair_cycles = ?, max_repair_cycles = ?, paused_from = ?, blocked_from = ?, updated_at = ?
     where id = ?`, workflow.state, workflow.mode, workflow.candidateId, workflow.repairTarget, workflow.repairCycles, workflow.maxRepairCycles, workflow.pausedFrom, workflow.blockedFrom, now, workflow.id);
}
export function loadRequest(database, workflowId) {
    const row = database.get("select * from requests where workflow_id = ?", workflowId);
    if (row === undefined)
        return undefined;
    return {
        amendments: JSON.parse(String(row["amendments"])),
        digest: String(row["digest"]),
        originalText: String(row["original_text"]),
    };
}
export function amendRequest(database, workflowId, text, now) {
    const current = loadRequest(database, workflowId);
    if (current === undefined)
        throw new Error("no request for this workflow");
    const amendments = [
        ...current.amendments,
        { receivedAt: now, sequence: current.amendments.length + 1, text },
    ];
    database.run("update requests set amendments = ? where workflow_id = ?", JSON.stringify(amendments), workflowId);
}
function toWorkflow(row) {
    return {
        blockedFrom: row["blocked_from"] ?? null,
        candidateId: row["candidate_id"] ?? null,
        createdAt: Number(row["created_at"]),
        id: String(row["id"]),
        maxRepairCycles: Number(row["max_repair_cycles"]),
        mode: row["mode"] ?? null,
        pausedFrom: row["paused_from"] ?? null,
        projectId: String(row["project_id"]),
        repairCycles: Number(row["repair_cycles"]),
        repairTarget: row["repair_target"] ?? null,
        state: String(row["state"]),
        updatedAt: Number(row["updated_at"]),
    };
}

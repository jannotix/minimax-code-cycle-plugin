import type { Database, Row } from "./database.ts"

export type WorkflowRole =
  | "architect"
  | "executor"
  | "functional_reviewer"
  | "security_reviewer"
  | "arbiter"

export interface RoleSession {
  readonly boundAt: number
  readonly candidateId: string | null
  readonly role: WorkflowRole
  readonly sessionId: string
  readonly workflowId: string
}

export class RoleSessionRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RoleSessionRejected"
  }
}

const CANDIDATE_ROLES = new Set<WorkflowRole>([
  "functional_reviewer",
  "security_reviewer",
  "arbiter",
])

export function bindRoleSession(
  database: Database,
  workflowId: string,
  candidateId: string | null,
  role: WorkflowRole,
  sessionId: string,
  now: number,
): RoleSession {
  const identifier = sessionId.trim()
  if (!identifier || Buffer.byteLength(identifier, "utf8") > 128) {
    throw new RoleSessionRejected("native role session id must be 1 to 128 bytes")
  }
  const workflow = database.get<{ id: string }>("select id from workflows where id = ?", workflowId)
  if (workflow === undefined) throw new RoleSessionRejected(`unknown workflow: ${workflowId}`)
  if (CANDIDATE_ROLES.has(role) && candidateId === null) {
    throw new RoleSessionRejected(`${role} requires a frozen candidate`)
  }
  if (candidateId !== null) {
    const candidate = database.get<{ workflow_id: string }>(
      "select workflow_id from candidates where id = ?",
      candidateId,
    )
    if (candidate === undefined || candidate.workflow_id !== workflowId) {
      throw new RoleSessionRejected("candidate does not belong to this workflow")
    }
  }

  return database.transaction(() => {
    if (!CANDIDATE_ROLES.has(role)) {
      const assigned = database.get<Row>(
        "select * from workflow_role_sessions where workflow_id = ? and role = ? limit 1",
        workflowId,
        role,
      )
      if (assigned !== undefined && String(assigned["session_id"]) !== identifier) {
        throw new RoleSessionRejected(`${role} must resume its originally bound native session`)
      }
    }
    if (candidateId !== null && CANDIDATE_ROLES.has(role)) {
      const assigned = database.get<Row>(
        "select * from workflow_role_sessions where candidate_id = ? and role = ?",
        candidateId,
        role,
      )
      if (assigned !== undefined && String(assigned["session_id"]) !== identifier) {
        throw new RoleSessionRejected(`${role} must resume its originally bound native session`)
      }
    }
    const used = database.get<Row>(
      "select * from workflow_role_sessions where workflow_id = ? and session_id = ?",
      workflowId,
      identifier,
    )
    if (used !== undefined) {
      const existing = toRoleSession(used)
      if (existing.role !== role) {
        throw new RoleSessionRejected(
          `native session ${identifier} is already bound to ${existing.role}, not ${role}`,
        )
      }
      if (CANDIDATE_ROLES.has(role) && existing.candidateId !== candidateId) {
        throw new RoleSessionRejected(`${role} must use a fresh native session for a repaired candidate`)
      }
      return existing
    }

    database.run(
      `insert into workflow_role_sessions (workflow_id, candidate_id, role, session_id, bound_at)
       values (?, ?, ?, ?, ?)`,
      workflowId,
      candidateId,
      role,
      identifier,
      now,
    )
    return { boundAt: now, candidateId, role, sessionId: identifier, workflowId }
  })
}

export function roleSessions(database: Database, workflowId: string): RoleSession[] {
  return database
    .all<Row>(
      "select * from workflow_role_sessions where workflow_id = ? order by bound_at, rowid",
      workflowId,
    )
    .map(toRoleSession)
}

export function candidateReviewerSessions(
  database: Database,
  workflowId: string,
  candidateId: string,
): { functional: string; security: string } | null {
  const sessions = roleSessions(database, workflowId).filter(
    (entry) => entry.candidateId === candidateId,
  )
  const functional = sessions.filter((entry) => entry.role === "functional_reviewer")
  const security = sessions.filter((entry) => entry.role === "security_reviewer")
  if (functional.length !== 1 || security.length !== 1) return null
  if (functional[0]!.sessionId === security[0]!.sessionId) return null
  return { functional: functional[0]!.sessionId, security: security[0]!.sessionId }
}

function toRoleSession(row: Row): RoleSession {
  return {
    boundAt: Number(row["bound_at"]),
    candidateId: (row["candidate_id"] as string | null) ?? null,
    role: String(row["role"]) as WorkflowRole,
    sessionId: String(row["session_id"]),
    workflowId: String(row["workflow_id"]),
  }
}

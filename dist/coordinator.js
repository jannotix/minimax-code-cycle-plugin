export function nextCoordinatorAction(input) {
    const base = {
        artifacts: {
            mode: input.workflow.mode,
            state: input.workflow.state,
            workflowId: input.workflow.id,
        },
    };
    if (!input.setupReady) {
        return stopped(base, "error", "native Cycle setup is not ready", "setup or live capability-profile verification is missing");
    }
    if (!input.nativeMavis || !input.nativeTask) {
        return stopped(base, "error", "native MiniMax orchestration is unavailable", "mavis and task tools are both required");
    }
    if (input.browserRequired && input.browser !== "available") {
        return stopped(base, "error", "browser capability is required but unavailable", `browser capability is ${input.browser}`);
    }
    switch (input.workflow.state) {
        case "architecture":
            return role(base, input, "architect", null, "the architect must produce the validated plan");
        case "execution":
            return execution(base, input);
        case "quick_execution": {
            const executor = latestSession(input, "executor");
            return executor === null
                ? role(base, input, "executor", null, "the quick route needs one bounded implementation session")
                : control(base, "freeze_candidate", "the quick executor reported; freeze the exact candidate");
        }
        case "verification":
            return control(base, "verify", "run deterministic gates against the frozen candidate");
        case "independent_reviews":
            return reviews(base, input);
        case "arbitration":
            return role(base, input, "arbiter", null, "the arbiter must decide against the immutable request");
        case "delivery":
            return control(base, "deliver", "promote only the approved candidate bytes");
        case "repair":
            return control(base, "retry", "start the recorded repair target within the remaining budget");
        case "paused":
            return stopped(base, "warning", "workflow is paused", "wait for an explicit user resume");
        case "blocked":
            return stopped(base, "warning", "workflow is blocked", "the user must extend the repair budget, amend, or cancel");
        case "completed":
            return stopped(base, "success", "workflow is completed", "report the exact returned state and revision");
        case "cancelled":
            return stopped(base, "warning", "workflow is cancelled", "report cancellation without resuming work");
        case "intake":
        case "routing":
            return stopped(base, "error", "workflow stopped in an internal transition state", "call reconcile and do not invent the next state");
        default:
            return stopped(base, "error", "workflow state is unsupported", "stop and inspect the control-plane version");
    }
}
function execution(base, input) {
    if (input.tasks.length === 0) {
        return stopped(base, "error", "full execution has no planned tasks", "return to architecture");
    }
    if (input.tasks.every((task) => task.state === "completed")) {
        return control(base, "freeze_candidate", "all planned tasks are complete; freeze the exact candidate");
    }
    const completed = new Set(input.tasks.filter((task) => task.state === "completed").map((task) => task.key));
    const next = input.tasks.find((task) => task.state !== "completed" && task.dependencies.every((key) => completed.has(key)));
    if (next === undefined) {
        return stopped(base, "error", "no executable task remains", "the task graph or reported task states are inconsistent");
    }
    return role(base, input, "executor", next.key, `execute only ${next.key} inside its write scopes`);
}
function reviews(base, input) {
    const submitted = new Set(input.reviews.map((review) => review.role));
    const missing = ["functional_reviewer", "security_reviewer"].filter((roleName) => !submitted.has(roleName));
    if (missing.length === 0) {
        return stopped(base, "error", "reviews exist but arbitration did not open", "reconcile the durable workflow state");
    }
    if (missing.length === 2 && missing.every((roleName) => latestSession(input, roleName) === null)) {
        return {
            ...base,
            action: { blind: true, kind: "dispatch_reviews", roles: missing },
            next_actions: ["dispatch both reviewers in separate background sessions", "withhold each verdict from the other"],
            status: "success",
            summary: "dispatch both independent reviewers blind to one another",
        };
    }
    const next = missing[0];
    return role(base, input, next, null, `complete the missing ${next} review without exposing the other verdict`);
}
function role(base, input, roleName, taskKey, summary) {
    const existing = latestSession(input, roleName);
    return {
        ...base,
        action: existing === null
            ? { kind: "dispatch_role", role: roleName, taskKey }
            : { kind: "resume_role", role: roleName, sessionId: existing, taskKey },
        next_actions: [
            existing === null ? `create a separate ${roleName} task session` : `resume ${existing}`,
            "submit only schema-valid output to the control plane",
        ],
        status: "success",
        summary,
    };
}
function latestSession(input, roleName) {
    const candidateBound = roleName === "functional_reviewer" || roleName === "security_reviewer" || roleName === "arbiter";
    const matching = input.roleSessions.filter((entry) => entry.role === roleName &&
        (!candidateBound || entry.candidateId === input.workflow.candidateId));
    return matching.at(-1)?.sessionId ?? null;
}
function control(base, operation, summary) {
    return {
        ...base,
        action: { kind: "control_plane", operation },
        next_actions: [`call cycle_workflow ${operation}`, "read the returned state before continuing"],
        status: "success",
        summary,
    };
}
function stopped(base, status, summary, reason) {
    return {
        ...base,
        action: { kind: "stop", reason },
        next_actions: [reason],
        status,
        summary,
    };
}

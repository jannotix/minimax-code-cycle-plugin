const PREFIX = "CYCLE_";
export function readConfiguration(environment = process.env) {
    const invalid = [];
    return {
        dataDirectory: option(environment, "DATA_DIR") || undefined,
        gateStrictness: readStrictness(environment, invalid),
        invalid,
        maxRepairCycles: readRepairCycles(environment, invalid),
        securityProofs: readSecurityProofs(environment, invalid),
    };
}
function readStrictness(environment, invalid) {
    const value = option(environment, "GATE_STRICTNESS").toLowerCase();
    if (!value)
        return "standard";
    if (value === "advisory" || value === "standard" || value === "strict")
        return value;
    invalid.push("CYCLE_GATE_STRICTNESS must be advisory, standard, or strict");
    return "standard";
}
function readSecurityProofs(environment, invalid) {
    const value = option(environment, "SECURITY_PROOFS").toLowerCase();
    if (!value || value === "off")
        return false;
    if (value === "on")
        return true;
    invalid.push("CYCLE_SECURITY_PROOFS must be on or off");
    return false;
}
function option(environment, key) {
    return (environment[`${PREFIX}${key}`] ?? "").trim();
}
function readRepairCycles(environment, invalid) {
    const value = option(environment, "MAX_REPAIR_CYCLES");
    if (!value)
        return 5;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
        invalid.push("CYCLE_MAX_REPAIR_CYCLES must be an integer between 1 and 20");
        return 5;
    }
    return parsed;
}

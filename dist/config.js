const PREFIX = "CYCLE_";
export function readConfiguration(environment = process.env) {
    const invalid = [];
    return {
        dataDirectory: option(environment, "DATA_DIR") || undefined,
        invalid,
        maxRepairCycles: readRepairCycles(environment, invalid),
    };
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

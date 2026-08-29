export type Role =
  | "architect"
  | "executor"
  | "functional_reviewer"
  | "security_reviewer"
  | "arbiter"
  | "coordinator"
  | "system"

export interface Configuration {
  readonly dataDirectory: string | undefined
  readonly invalid: readonly string[]
  readonly maxRepairCycles: number
}

const PREFIX = "CYCLE_"

export function readConfiguration(environment: NodeJS.ProcessEnv = process.env): Configuration {
  const invalid: string[] = []
  return {
    dataDirectory: option(environment, "DATA_DIR") || undefined,
    invalid,
    maxRepairCycles: readRepairCycles(environment, invalid),
  }
}

function option(environment: NodeJS.ProcessEnv, key: string): string {
  return (environment[`${PREFIX}${key}`] ?? "").trim()
}

function readRepairCycles(environment: NodeJS.ProcessEnv, invalid: string[]): number {
  const value = option(environment, "MAX_REPAIR_CYCLES")
  if (!value) return 5
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    invalid.push("CYCLE_MAX_REPAIR_CYCLES must be an integer between 1 and 20")
    return 5
  }
  return parsed
}

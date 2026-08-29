import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync, type StatementSync } from "node:sqlite"

import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from "./migrations.ts"

export type StoreMode = "read_write" | "safe_read_only"

export type Row = Record<string, unknown>

export class StoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "StoreError"
  }
}

export interface DatabaseOptions {
  readonly path: string
}

export class Database {
  readonly #database: DatabaseSync
  readonly #mode: StoreMode
  readonly #schemaVersion: number
  readonly #statements = new Map<string, StatementSync>()
  #depth = 0

  constructor(options: DatabaseOptions) {
    if (options.path !== ":memory:") mkdirSync(dirname(options.path), { recursive: true })

    const database = new DatabaseSync(options.path)
    // The very first schema read can race another process creating or migrating the same store.
    // Install the startup wait before that read; setting it afterwards is one lock too late.
    database.exec("pragma busy_timeout = 30000")
    const existing = readSchemaVersion(database)

    // A store written by a newer plugin is opened read-only rather than migrated downward, so an
    // older installation can never truncate state it does not understand.
    if (existing > CURRENT_SCHEMA_VERSION) {
      database.close()
      this.#database = new DatabaseSync(options.path, { readOnly: true })
      this.#database.exec("pragma busy_timeout = 5000")
      this.#mode = "safe_read_only"
      this.#schemaVersion = existing
      return
    }

    database.exec("pragma foreign_keys = ON")
    if (options.path !== ":memory:") database.exec("pragma journal_mode = WAL")
    const migrated = migrate(database, existing)

    // A newer process may have migrated the shared store while this one waited for the write lock.
    // Re-check after migration and fail safe rather than claiming this build owns the newer schema.
    if (migrated > CURRENT_SCHEMA_VERSION) {
      database.close()
      this.#database = new DatabaseSync(options.path, { readOnly: true })
      this.#database.exec("pragma busy_timeout = 5000")
      this.#mode = "safe_read_only"
      this.#schemaVersion = migrated
      return
    }

    this.#database = database
    this.#database.exec("pragma busy_timeout = 5000")
    this.#mode = "read_write"
    this.#schemaVersion = migrated
  }

  get mode(): StoreMode {
    return this.#mode
  }

  get schemaVersion(): number {
    return this.#schemaVersion
  }

  run(sql: string, ...parameters: readonly SqlValue[]): void {
    this.#assertWritable()
    this.#prepare(sql).run(...parameters)
  }

  get<T extends Row>(sql: string, ...parameters: readonly SqlValue[]): T | undefined {
    return this.#prepare(sql).get(...parameters) as T | undefined
  }

  all<T extends Row>(sql: string, ...parameters: readonly SqlValue[]): T[] {
    return this.#prepare(sql).all(...parameters) as T[]
  }

  /**
   * Re-entrant: a repository that wraps another repository's write must not open a second
   * transaction. Nested calls join the outermost one through a savepoint.
   */
  transaction<T>(operation: () => T): T {
    this.#assertWritable()

    if (this.#depth > 0) {
      const savepoint = `cycle_sp_${this.#depth}`
      this.#depth += 1
      this.#database.exec(`savepoint ${savepoint}`)
      try {
        const result = operation()
        this.#database.exec(`release ${savepoint}`)
        return result
      } catch (error) {
        this.#database.exec(`rollback to ${savepoint}`)
        this.#database.exec(`release ${savepoint}`)
        throw error
      } finally {
        this.#depth -= 1
      }
    }

    this.#depth = 1
    this.#database.exec("begin immediate")
    try {
      const result = operation()
      this.#database.exec("commit")
      return result
    } catch (error) {
      this.#database.exec("rollback")
      throw error
    } finally {
      this.#depth = 0
    }
  }

  close(): void {
    this.#statements.clear()
    this.#database.close()
  }

  #assertWritable(): void {
    if (this.#mode === "safe_read_only") {
      throw new StoreError(
        `the store was written by schema version ${this.#schemaVersion}; this build supports ` +
          `${CURRENT_SCHEMA_VERSION} and opened it read-only`,
      )
    }
  }

  #prepare(sql: string): StatementSync {
    const cached = this.#statements.get(sql)
    if (cached !== undefined) return cached
    const statement = this.#database.prepare(sql)
    this.#statements.set(sql, statement)
    return statement
  }
}

export type SqlValue = Uint8Array | bigint | null | number | string

function readSchemaVersion(database: DatabaseSync): number {
  const row = database.prepare("pragma user_version").get() as { user_version?: number } | undefined
  return typeof row?.user_version === "number" ? row.user_version : 0
}

function migrate(database: DatabaseSync, from: number): number {
  if (from > CURRENT_SCHEMA_VERSION) return from

  for (const migration of [...MIGRATIONS].sort((left, right) => left.version - right.version)) {
    database.exec("begin immediate")
    try {
      const current = readSchemaVersion(database)
      if (current >= migration.version) {
        database.exec("commit")
        continue
      }
      if (current !== migration.version - 1) {
        throw new Error(`schema is at ${current}; migration ${migration.version} is not contiguous`)
      }
      database.exec(migration.sql)
      database.exec(`pragma user_version = ${migration.version}`)
      database.exec("commit")
    } catch (error) {
      database.exec("rollback")
      throw new StoreError(`migration ${migration.version} (${migration.name}) failed`, {
        cause: error,
      })
    }
  }
  return readSchemaVersion(database)
}

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from "./migrations.js";
export class StoreError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = "StoreError";
    }
}
export class Database {
    #database;
    #mode;
    #schemaVersion;
    #statements = new Map();
    #depth = 0;
    constructor(options) {
        if (options.path !== ":memory:")
            mkdirSync(dirname(options.path), { recursive: true });
        const database = new DatabaseSync(options.path);
        database.exec("pragma busy_timeout = 30000");
        const existing = readSchemaVersion(database);
        if (existing > CURRENT_SCHEMA_VERSION) {
            database.close();
            this.#database = new DatabaseSync(options.path, { readOnly: true });
            this.#database.exec("pragma busy_timeout = 5000");
            this.#mode = "safe_read_only";
            this.#schemaVersion = existing;
            return;
        }
        database.exec("pragma foreign_keys = ON");
        if (options.path !== ":memory:")
            retryBusyStartup(() => database.exec("pragma journal_mode = WAL"));
        const migrated = retryBusyStartup(() => migrate(database, existing));
        if (migrated > CURRENT_SCHEMA_VERSION) {
            database.close();
            this.#database = new DatabaseSync(options.path, { readOnly: true });
            this.#database.exec("pragma busy_timeout = 5000");
            this.#mode = "safe_read_only";
            this.#schemaVersion = migrated;
            return;
        }
        this.#database = database;
        this.#database.exec("pragma busy_timeout = 5000");
        this.#mode = "read_write";
        this.#schemaVersion = migrated;
    }
    get mode() {
        return this.#mode;
    }
    get schemaVersion() {
        return this.#schemaVersion;
    }
    run(sql, ...parameters) {
        this.#assertWritable();
        this.#prepare(sql).run(...parameters);
    }
    get(sql, ...parameters) {
        return this.#prepare(sql).get(...parameters);
    }
    all(sql, ...parameters) {
        return this.#prepare(sql).all(...parameters);
    }
    transaction(operation) {
        this.#assertWritable();
        if (this.#depth > 0) {
            const savepoint = `cycle_sp_${this.#depth}`;
            this.#depth += 1;
            this.#database.exec(`savepoint ${savepoint}`);
            try {
                const result = operation();
                this.#database.exec(`release ${savepoint}`);
                return result;
            }
            catch (error) {
                this.#database.exec(`rollback to ${savepoint}`);
                this.#database.exec(`release ${savepoint}`);
                throw error;
            }
            finally {
                this.#depth -= 1;
            }
        }
        this.#depth = 1;
        this.#database.exec("begin immediate");
        try {
            const result = operation();
            this.#database.exec("commit");
            return result;
        }
        catch (error) {
            this.#database.exec("rollback");
            throw error;
        }
        finally {
            this.#depth = 0;
        }
    }
    close() {
        this.#statements.clear();
        this.#database.close();
    }
    #assertWritable() {
        if (this.#mode === "safe_read_only") {
            throw new StoreError(`the store was written by schema version ${this.#schemaVersion}; this build supports ` +
                `${CURRENT_SCHEMA_VERSION} and opened it read-only`);
        }
    }
    #prepare(sql) {
        const cached = this.#statements.get(sql);
        if (cached !== undefined)
            return cached;
        const statement = this.#database.prepare(sql);
        this.#statements.set(sql, statement);
        return statement;
    }
}
function readSchemaVersion(database) {
    const row = database.prepare("pragma user_version").get();
    return typeof row?.user_version === "number" ? row.user_version : 0;
}
const STARTUP_LOCK_DELAYS_MS = [5, 10, 20, 40, 80, 160, 320, 640, 1_280, 2_560, 5_120, 10_240];
const STARTUP_WAIT = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
function retryBusyStartup(operation) {
    for (const delay of STARTUP_LOCK_DELAYS_MS) {
        try {
            return operation();
        }
        catch (error) {
            if (!isBusyDatabaseError(error))
                throw error;
            Atomics.wait(STARTUP_WAIT, 0, 0, delay);
        }
    }
    return operation();
}
function isBusyDatabaseError(error) {
    if (typeof error !== "object" || error === null)
        return false;
    const sqlite = error;
    return sqlite.errcode === 5 || /database is (?:busy|locked)/iu.test(`${typeof sqlite.errstr === "string" ? sqlite.errstr : ""} ${typeof sqlite.message === "string" ? sqlite.message : ""}`);
}
function migrate(database, from) {
    if (from > CURRENT_SCHEMA_VERSION)
        return from;
    for (const migration of [...MIGRATIONS].sort((left, right) => left.version - right.version)) {
        let transactionOpen = false;
        try {
            database.exec("begin immediate");
            transactionOpen = true;
            const current = readSchemaVersion(database);
            if (current >= migration.version) {
                database.exec("commit");
                transactionOpen = false;
                continue;
            }
            if (current !== migration.version - 1) {
                throw new Error(`schema is at ${current}; migration ${migration.version} is not contiguous`);
            }
            database.exec(migration.sql);
            database.exec(`pragma user_version = ${migration.version}`);
            database.exec("commit");
            transactionOpen = false;
        }
        catch (error) {
            if (transactionOpen)
                database.exec("rollback");
            if (isBusyDatabaseError(error))
                throw error;
            throw new StoreError(`migration ${migration.version} (${migration.name}) failed`, {
                cause: error,
            });
        }
    }
    return readSchemaVersion(database);
}

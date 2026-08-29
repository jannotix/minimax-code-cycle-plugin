import { isAbsolute, join, relative } from "node:path";
import { AdmissionController } from "./admission.js";
import { readConfiguration } from "./config.js";
import { resolveDataDirectory } from "./paths.js";
import { identifyProject } from "./project.js";
import { CpuSampler, readResources } from "./resources.js";
import { Database } from "./store/database.js";
const DATABASE_FILE = "cycle.db";
export class Runtime {
    admission = new AdmissionController();
    configuration;
    dataDirectory;
    #sampler = new CpuSampler();
    #database;
    #failure;
    constructor(environment = process.env) {
        this.configuration = readConfiguration(environment);
        this.dataDirectory = resolveDataDirectory(this.configuration.dataDirectory, environment);
    }
    project(projectRoot) {
        const project = identifyProject(projectRoot);
        const inside = relative(project.path, this.dataDirectory);
        if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
            throw new Error("the durable data directory must be outside project_root");
        }
        return project;
    }
    store() {
        if (this.#database !== undefined)
            return this.#database;
        if (this.#failure !== undefined)
            return undefined;
        try {
            this.#database = new Database({ path: join(this.dataDirectory, DATABASE_FILE) });
            return this.#database;
        }
        catch (error) {
            this.#failure = error instanceof Error ? error : new Error(String(error));
            return undefined;
        }
    }
    requireStore() {
        const database = this.store();
        if (database === undefined)
            throw this.#failure ?? new Error("the Cycle store is unavailable");
        return database;
    }
    resources(now = Date.now()) {
        return readResources(this.dataDirectory, this.#sampler, now);
    }
    storeFailure() {
        return this.#failure;
    }
    close() {
        this.#database?.close();
        this.#database = undefined;
    }
}

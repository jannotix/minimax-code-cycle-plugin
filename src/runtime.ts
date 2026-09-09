import { join } from "node:path"

import { AdmissionController } from "./admission.ts"
import { readConfiguration, type Configuration } from "./config.ts"
import {
  canonicalPath,
  containsPath,
  resolveDataDirectoryResolution,
  type DataDirectorySource,
} from "./paths.ts"
import { identifyProject, type Project } from "./project.ts"
import { CpuSampler, readResources, type ResourceReading } from "./resources.ts"
import { Database } from "./store/database.ts"

const DATABASE_FILE = "cycle.db"

/** One process-wide store and one project identity per explicit root. */
export class Runtime {
  readonly admission = new AdmissionController()
  readonly configuration: Configuration
  readonly dataDirectory: string
  readonly dataDirectorySource: DataDirectorySource

  readonly #sampler = new CpuSampler()
  #database: Database | undefined
  #failure: Error | undefined

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.configuration = readConfiguration(environment)
    const resolution = resolveDataDirectoryResolution(this.configuration.dataDirectory, environment)
    // Canonical from here on: the store path, the signing key and every containment check read this
    // field, and a project identity is canonical already, so the two must be spelled the same way.
    this.dataDirectory = canonicalPath(resolution.path)
    this.dataDirectorySource = resolution.source
  }

  project(projectRoot: string): Project {
    const project = identifyProject(projectRoot)
    if (containsPath(project.path, this.dataDirectory)) {
      throw new Error("the durable data directory must be outside project_root")
    }
    return project
  }

  store(): Database | undefined {
    if (this.#database !== undefined) return this.#database
    if (this.#failure !== undefined) return undefined
    try {
      this.#database = new Database({ path: join(this.dataDirectory, DATABASE_FILE) })
      return this.#database
    } catch (error) {
      this.#failure = error instanceof Error ? error : new Error(String(error))
      return undefined
    }
  }

  requireStore(): Database {
    const database = this.store()
    if (database === undefined) throw this.#failure ?? new Error("the Cycle store is unavailable")
    return database
  }

  resources(now = Date.now()): Promise<ResourceReading> {
    return readResources(this.dataDirectory, this.#sampler, now)
  }

  storeFailure(): Error | undefined {
    return this.#failure
  }

  close(): void {
    this.#database?.close()
    this.#database = undefined
  }
}

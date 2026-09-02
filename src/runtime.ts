import { isAbsolute, join, relative } from "node:path"

import { AdmissionController } from "./admission.ts"
import { readConfiguration, type Configuration } from "./config.ts"
import { resolveDataDirectoryResolution, type DataDirectorySource } from "./paths.ts"
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
    this.dataDirectory = resolution.path
    this.dataDirectorySource = resolution.source
  }

  project(projectRoot: string): Project {
    const project = identifyProject(projectRoot)
    const inside = relative(project.path, this.dataDirectory)
    if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
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

import { availableParallelism } from "node:os";
import { extname } from "node:path";
import { Worker } from "node:worker_threads";
import { parseProjectFile } from "./parser.js";
const BATCH = 32;
export class ParsePool {
    #idle = [];
    #pending = new Map();
    #queue = [];
    #size;
    #workers = new Set();
    #workerFactory;
    #fallbackTail = Promise.resolve();
    #inProcess = false;
    #next = 0;
    constructor(size = Math.max(1, Math.min(8, availableParallelism() - 1)), workerFactory = (entry) => new Worker(entry)) {
        this.#size = size;
        this.#workerFactory = workerFactory;
    }
    async parse(root, paths) {
        if (paths.length === 0)
            return [];
        const batches = [];
        for (let index = 0; index < paths.length; index += BATCH) {
            batches.push(this.#dispatch(root, paths.slice(index, index + BATCH)));
        }
        return (await Promise.all(batches)).flat();
    }
    async dispose() {
        const workers = [...this.#workers];
        this.#workers.clear();
        this.#idle.length = 0;
        await Promise.allSettled(workers.map((worker) => worker.terminate()));
    }
    async #dispatch(root, paths) {
        if (this.#inProcess)
            return this.#inProcessParse(root, paths);
        const worker = this.#acquire();
        if (worker === undefined) {
            if (this.#inProcess)
                return this.#inProcessParse(root, paths);
            return new Promise((resolve, reject) => {
                this.#queue.push({ paths, pending: { reject, resolve }, root });
            });
        }
        return new Promise((resolve, reject) => {
            const id = (this.#next += 1);
            this.#pending.set(id, { paths, reject, resolve, root, worker });
            worker.postMessage({ id, paths, root });
        });
    }
    #inProcessParse(root, paths) {
        const task = this.#fallbackTail.then(async () => {
            const results = [];
            for (const path of paths)
                results.push(await parseProjectFile(root, path));
            return results;
        });
        this.#fallbackTail = task.then(() => undefined, () => undefined);
        return task;
    }
    #acquire() {
        const idle = this.#idle.pop();
        if (idle !== undefined)
            return idle;
        if (this.#workers.size >= this.#size)
            return undefined;
        return this.#spawn();
    }
    #spawn() {
        try {
            const entry = new URL(`./worker${extname(import.meta.url)}`, import.meta.url);
            const worker = this.#workerFactory(entry);
            worker.unref();
            worker.on("message", (message) => {
                if (!this.#workers.has(worker))
                    return;
                const pending = this.#pending.get(message.id);
                if (pending === undefined)
                    return;
                pending.resolve(message.results);
                this.#pending.delete(message.id);
                this.#release(worker);
            });
            worker.on("error", (error) => this.#fail(worker, error));
            worker.on("exit", (code) => {
                this.#fail(worker, new Error(`intel worker exited with code ${code}`));
            });
            this.#workers.add(worker);
            return worker;
        }
        catch {
            this.#inProcess = true;
            return undefined;
        }
    }
    #release(worker) {
        const next = this.#queue.shift();
        if (next === undefined) {
            this.#idle.push(worker);
            return;
        }
        const id = (this.#next += 1);
        this.#pending.set(id, { ...next.pending, paths: next.paths, root: next.root, worker });
        worker.postMessage({ id, paths: next.paths, root: next.root });
    }
    #fail(worker, error) {
        if (!this.#workers.delete(worker))
            return;
        this.#inProcess = true;
        for (const [id, pending] of this.#pending) {
            if (pending.worker !== worker)
                continue;
            this.#pending.delete(id);
            this.#inProcessParse(pending.root, pending.paths).then(pending.resolve, pending.reject);
        }
        for (const queued of this.#queue.splice(0)) {
            this.#inProcessParse(queued.root, queued.paths).then(queued.pending.resolve, queued.pending.reject);
        }
        void error;
    }
}

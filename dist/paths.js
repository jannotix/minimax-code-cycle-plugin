import { homedir } from "node:os";
import { posix, resolve, win32 } from "node:path";
export class PathError extends Error {
    constructor(message) {
        super(message);
        this.name = "PathError";
    }
}
export function resolveDataDirectory(configured, environment = process.env, platform = process.platform) {
    if (configured)
        return resolve(configured);
    if (platform === "win32") {
        const base = environment["LOCALAPPDATA"]?.trim();
        if (!base)
            throw new PathError("LOCALAPPDATA is not set");
        return win32.join(base, "Cycle for MiniMax Code");
    }
    const home = environment["HOME"]?.trim() || homedir();
    if (platform === "darwin") {
        return posix.join(home, "Library", "Application Support", "Cycle for MiniMax Code");
    }
    const base = environment["XDG_DATA_HOME"]?.trim() || posix.join(home, ".local", "share");
    return posix.join(base, "cycle-minimax");
}

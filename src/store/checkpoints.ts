import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto"
import { execFileSync } from "node:child_process"
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Database, Row } from "./database.ts"
import { DIGEST_DOMAIN } from "./ids.ts"

const KEY_DIRECTORY = "keys"
const KEY_FILE = "checkpoint.key"

export interface Checkpoint {
  readonly createdAt: number
  readonly hash: string
  readonly publicKey: string
  readonly sequence: number
  readonly signature: string
}

export class SigningError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "SigningError"
  }
}

/**
 * The signing key is generated once, on first use, and never leaves the data directory. Permissions
 * are restricted at creation: 0600 on POSIX, and on Windows an ACL granting the current user alone,
 * because a file everyone can read is a signature anyone can forge.
 */
export function signingKey(dataDirectory: string): { privatePem: string; publicPem: string } {
  const directory = join(dataDirectory, KEY_DIRECTORY)
  const path = join(directory, KEY_FILE)

  let privatePem: string
  try {
    privatePem = readFileSync(path, "utf8")
  } catch {
    mkdirSync(directory, { recursive: true })
    const pair = generateKeyPairSync("ed25519")
    privatePem = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString()
    writeFileSync(path, privatePem, { encoding: "utf8", mode: 0o600 })
    restrict(path)
  }

  const privateKey = createPrivateKey(privatePem)
  return {
    privatePem,
    publicPem: createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString(),
  }
}

const ICACLS_TIMEOUT_MS = 5_000

function restrict(path: string): void {
  if (process.platform !== "win32") {
    try {
      chmodSync(path, 0o600)
    } catch {
      // A filesystem without POSIX modes cannot be tightened; keyPermissions still reports it.
    }
    return
  }

  // Synchronously, and this is the whole point: an asynchronous call here can lose the race with
  // process exit, and the key then keeps whatever the temp directory's inherited ACL granted —
  // which on a shared machine is several accounts with Modify. Failure is not fatal, because
  // keyPermissions reports what the file actually carries rather than what this tried to set.
  const account = principal()
  if (account === null) return
  try {
    execFileSync("icacls", [path, "/inheritance:r", "/grant:r", `${account}:F`], {
      shell: false,
      stdio: "ignore",
      timeout: ICACLS_TIMEOUT_MS,
      windowsHide: true,
    })
  } catch {
    // Reported, not thrown: a key that exists and is loose is better than no key and no history.
  }
}

function principal(): string | null {
  const user = process.env["USERNAME"]?.trim()
  if (!user) return null
  const domain = process.env["USERDOMAIN"]?.trim()
  return domain ? `${domain}\\${user}` : user
}

export interface KeyPermissions {
  readonly detail: string
  readonly exists: boolean
  readonly restricted: boolean
}

/**
 * Principals that hold the key whatever its ACL says, so refusing them reports a condition nobody
 * can remove. An administrator can take ownership of any file on the machine, and SYSTEM is the
 * operating system. The POSIX side already concedes exactly this point: `0600` keeps other users
 * out and does not keep root out. Holding Windows to a stricter standard for the same property is
 * what made this refuse ordinary machines, including every Windows continuous-integration runner.
 *
 * Spelled without a locale: `icacls` renders these names in the display language of the machine, so
 * the well-known SID aliases are matched too.
 */
const UNAVOIDABLE_PRINCIPALS = new Set([
  "nt authority\\system",
  "builtin\\administrators",
  "administrators",
  "system",
  "s-1-5-18",
  "s-1-5-32-544",
])

/**
 * Groups that mean "more than one person", which is the condition this check exists to find. They
 * are named rather than inferred, because a group that grants everybody read is indistinguishable
 * from an ordinary second account by counting alone.
 */
const EVERYBODY_PRINCIPALS = new Set([
  "everyone",
  "builtin\\users",
  "users",
  "nt authority\\authenticated users",
  "authenticated users",
  "nt authority\\interactive",
  "s-1-1-0",
  "s-1-5-32-545",
  "s-1-5-11",
])

/**
 * What an `icacls` listing says about who can read the key.
 *
 * Exported and pure so the rule is tested on every platform rather than only where it runs: the
 * machine that refused this in continuous integration is not the machine most of these tests run
 * on, which is how a check too strict for Windows survived being written on Windows.
 */
export function inspectAcl(acl: string, path: string): { detail: string; restricted: boolean } {
  // An inherited entry means the key kept whatever the directory above it grants, which is the
  // state this check exists to catch, whoever the entry belongs to.
  if (acl.includes("(I)")) return { detail: "inherited access is still granted", restricted: false }

  const named: string[] = []
  for (const line of acl.split(/\r?\n/u)) {
    // The first line carries the path in front of the first entry, and principal names contain
    // spaces and backslashes — so the name is everything up to `:(`, not the last whitespace-
    // delimited token. Splitting on whitespace reads `NT AUTHORITY\SYSTEM` as `AUTHORITY\SYSTEM`.
    const rest = line.startsWith(path) ? line.slice(path.length) : line
    const found = /^\s*(.+?):\(/u.exec(rest)
    if (found?.[1] !== undefined) named.push(found[1].trim())
  }

  const everybody = named.filter((name) => EVERYBODY_PRINCIPALS.has(name.toLowerCase()))
  const accounts = named.filter(
    (name) =>
      !UNAVOIDABLE_PRINCIPALS.has(name.toLowerCase()) &&
      !EVERYBODY_PRINCIPALS.has(name.toLowerCase()),
  )

  if (everybody.length > 0) {
    return { detail: `granted to ${everybody.join(", ")}`, restricted: false }
  }
  if (accounts.length > 1) {
    return { detail: `granted to more than one account: ${accounts.join(", ")}`, restricted: false }
  }
  return { detail: accounts.length === 1 ? `only ${accounts[0]}` : "no account grant found", restricted: true }
}

/**
 * What the key file actually carries now, rather than what creation attempted. A signature is worth
 * the exclusivity of the key that made it, so this is read from the filesystem every time doctor
 * runs and not cached from the moment it was written.
 */
export function keyPermissions(dataDirectory: string): KeyPermissions {
  const path = join(dataDirectory, KEY_DIRECTORY, KEY_FILE)

  if (process.platform !== "win32") {
    try {
      const mode = statSync(path).mode & 0o777
      return {
        detail: `0${mode.toString(8)}`,
        exists: true,
        restricted: (mode & 0o077) === 0,
      }
    } catch {
      return { detail: "no key yet", exists: false, restricted: true }
    }
  }

  let acl: string
  try {
    // stderr is discarded explicitly: without it Node forwards it to the parent, and on a data
    // directory with no key yet icacls writes a not-found line into the server's own stream.
    acl = execFileSync("icacls", [path], {
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: ICACLS_TIMEOUT_MS,
      windowsHide: true,
    })
  } catch {
    return { detail: "no key yet", exists: false, restricted: true }
  }

  return { ...inspectAcl(acl, path), exists: true }
}

/** Signs the current head of the chain. Idempotent: signing the same sequence twice replaces it. */
export function signCheckpoint(
  database: Database,
  dataDirectory: string,
  now = Date.now(),
): Checkpoint | null {
  const head = database.get<{ hash: string; sequence: number }>(
    "select hash, sequence from history order by sequence desc limit 1",
  )
  if (head === undefined) return null

  const { privatePem, publicPem } = signingKey(dataDirectory)
  const signature = sign(null, payload(head.sequence, head.hash), createPrivateKey(privatePem))
    .toString("base64")

  database.run(
    `insert into checkpoints (sequence, hash, signature, public_key, created_at)
     values (?, ?, ?, ?, ?)
     on conflict (sequence) do update set
       hash = excluded.hash, signature = excluded.signature,
       public_key = excluded.public_key, created_at = excluded.created_at`,
    head.sequence,
    head.hash,
    signature,
    publicPem,
    now,
  )

  return { createdAt: now, hash: head.hash, publicKey: publicPem, sequence: head.sequence, signature }
}

export function latestCheckpoint(database: Database): Checkpoint | undefined {
  const row = database.get<Row>("select * from checkpoints order by sequence desc limit 1")
  return row === undefined ? undefined : toCheckpoint(row)
}

export type CheckpointVerification =
  | { readonly checked: number; readonly head: number | null; readonly valid: true }
  | { readonly reason: "detached" | "signature"; readonly sequence: number; readonly valid: false }

/**
 * Every checkpoint must still sign the hash the chain holds at that sequence. A `detached` failure
 * means the chain was rewritten under a signature that was valid for different bytes.
 */
export function verifyCheckpoints(database: Database): CheckpointVerification {
  const rows = database.all<Row>("select * from checkpoints order by sequence")
  let head: number | null = null

  for (const row of rows) {
    const checkpoint = toCheckpoint(row)
    const entry = database.get<{ hash: string }>(
      "select hash from history where sequence = ?",
      checkpoint.sequence,
    )
    if (entry === undefined || entry.hash !== checkpoint.hash) {
      return { reason: "detached", sequence: checkpoint.sequence, valid: false }
    }

    let ok = false
    try {
      ok = verify(
        null,
        payload(checkpoint.sequence, checkpoint.hash),
        createPublicKey(checkpoint.publicKey),
        Buffer.from(checkpoint.signature, "base64"),
      )
    } catch {
      ok = false
    }
    if (!ok) return { reason: "signature", sequence: checkpoint.sequence, valid: false }
    head = checkpoint.sequence
  }

  return { checked: rows.length, head, valid: true }
}

function payload(sequence: number, hash: string): Buffer {
  return Buffer.from(`${DIGEST_DOMAIN.historyEntry}/checkpoint/${sequence}/${hash}`, "utf8")
}

function toCheckpoint(row: Row): Checkpoint {
  return {
    createdAt: Number(row["created_at"]),
    hash: String(row["hash"]),
    publicKey: String(row["public_key"]),
    sequence: Number(row["sequence"]),
    signature: String(row["signature"]),
  }
}

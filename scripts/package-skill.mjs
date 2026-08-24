#!/usr/bin/env node
// Build a production tarball of the Cycle skill. The tarball contains
// only the production artifacts (skills/, mcp/, scripts/, assets/,
// README, LICENSE, NOTICE). Documentation, tests, debug notes, and the
// docs site are excluded.

import { createReadStream, createWriteStream } from "node:fs";
import { stat, readFile, mkdir, readdir, rm } from "node:fs/promises";
import { resolve, join, relative, sep } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

const INCLUDE_TOP = [
  "plugin.json",
  "mcp.json",
  "skills",
  "mcp",
  "scripts",
  "assets",
  "README.md",
  "LICENSE",
  "NOTICE",
];
const SCRIPT_HEADER = "#!/usr/bin/env node\n";

function usage() {
  process.stderr.write(
    "usage: package-skill <repo-root> --version <version> [--out <dir>]\n",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      args.flags[token.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function* walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function toTarPath(absolute, repoRoot, version) {
  const relativePath = relative(repoRoot, absolute).split(sep).join("/");
  return `minimax-code-cycle-plugin-v${version}/${relativePath}`;
}

function tarHeader(name, size) {
  // Minimal POSIX ustar header. The fields are space-padded, octal,
  // and the checksum is the sum of the bytes in the header block.
  const fields = [
    { name: "name", value: name, length: 100 },
    { name: "mode", value: "0000644", length: 8 },
    { name: "uid", value: "0000000", length: 8 },
    { name: "gid", value: "0000000", length: 8 },
    { name: "size", value: size.toString(8).padStart(11, "0"), length: 12 },
    { name: "mtime", value: "00000000000", length: 12 },
    { name: "checksum", value: "        ", length: 8 },
    { name: "typeflag", value: "0", length: 1 },
    { name: "linkname", value: "", length: 100 },
    { name: "magic", value: "ustar", length: 6 },
    { name: "version", value: "00", length: 2 },
    { name: "uname", value: "", length: 32 },
    { name: "gname", value: "", length: 32 },
    { name: "devmajor", value: "", length: 8 },
    { name: "devminor", value: "", length: 8 },
    { name: "prefix", value: "", length: 155 },
  ];
  let block = "";
  for (const field of fields) {
    block += field.value.padEnd(field.length, "\0").slice(0, field.length);
  }
  let checksum = 0;
  for (const ch of block) checksum += ch.charCodeAt(0);
  const checksumStr = checksum.toString(8).padStart(6, "0") + "\0 ";
  block = block.slice(0, 148) + checksumStr + block.slice(156);
  return Buffer.from(block, "binary");
}

function endOfArchiveBlocks() {
  return Buffer.alloc(1024, 0);
}

async function buildTar(repoRoot, version, outPath) {
  const included = [];
  for (const entry of INCLUDE_TOP) {
    const full = join(repoRoot, entry);
    if (!(await exists(full))) continue;
    const stats = await stat(full);
    if (stats.isDirectory()) {
      for await (const file of walk(full)) {
        const fileStats = await stat(file);
        if (fileStats.size > 100 * 1024 * 1024) {
          throw new Error(`file ${file} too large for tarball`);
        }
        included.push({ absolute: file, size: fileStats.size });
      }
    } else if (stats.isFile()) {
      included.push({ absolute: full, size: stats.size });
    }
  }

  const out = createWriteStream(outPath);
  for (const { absolute, size } of included) {
    const name = toTarPath(absolute, repoRoot, version);
    const header = tarHeader(name, size);
    out.write(header);
    const data = await readFile(absolute);
    if (data.length !== size) {
      throw new Error(`size changed during read of ${absolute}`);
    }
    out.write(data);
    const padding = (512 - (size % 512)) % 512;
    if (padding > 0) out.write(Buffer.alloc(padding, 0));
  }
  out.write(endOfArchiveBlocks());
  out.end();
  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  return included.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args._[0];
  const version = args.flags.version;
  const outDir = args.flags.out ?? repoRoot;
  if (repoRoot === undefined || version === undefined) usage();

  const absRoot = resolve(repoRoot);
  const absOut = resolve(outDir);
  await mkdir(absOut, { recursive: true });

  const tarball = join(absOut, `minimax-code-cycle-plugin-v${version}.tar`);
  const tarGz = `${tarball}.gz`;

  const count = await buildTar(absRoot, version, tarball);
  await pipeline(
    createReadStream(tarball),
    createGzip(),
    createWriteStream(tarGz),
  );
  await rm(tarball, { force: true });

  const finalStats = await stat(tarGz);
  process.stdout.write(
    `packaged ${count} files into ${tarGz} (${finalStats.size} bytes)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`package-skill: ${error.message}\n`);
  process.exit(1);
});

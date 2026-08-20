#!/usr/bin/env node
// Inspect a Cycle audit JSONL ledger. Reads a ledger and prints a
// filtered or summarized view. No state is modified.

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

function usage() {
  process.stderr.write(
    "usage: inspect-ledger <command> [args]\n" +
      "  inspect-ledger tail <path> [--n 20]\n" +
      "  inspect-ledger event <path> --event <name>\n" +
      "  inspect-ledger workflow <path> --id <workflow-id>\n" +
      "  inspect-ledger plan <path>\n",
  );
  process.exit(2);
}

async function readLines(path) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter((line) => line.length > 0);
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

function summarize(entry) {
  const seq = String(entry.seq).padStart(5, " ");
  const role = entry.actor?.role ?? "?";
  const event = entry.event ?? "?";
  return `${seq}  ${entry.ts}  ${role.padEnd(22)}  ${event}`;
}

async function cmdTail(path, count) {
  const lines = await readLines(path);
  const slice = lines.slice(-count);
  for (const line of slice) process.stdout.write(summarize(JSON.parse(line)) + "\n");
}

async function cmdEvent(path, name) {
  const lines = await readLines(path);
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.event === name) process.stdout.write(JSON.stringify(entry, null, 2) + "\n");
  }
}

async function cmdWorkflow(path, id) {
  const lines = await readLines(path);
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.workflow_id === id) process.stdout.write(JSON.stringify(entry, null, 2) + "\n");
  }
}

async function cmdPlan(path) {
  // Walks the ledger and validates every plan_submitted against
  // cycle.plan.v1. Reports which plans are well-formed.
  const lines = await readLines(path);
  const required = ["id", "request_digest", "constraints", "non_goals", "requirements", "tasks"];
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.event !== "plan_submitted") continue;
    const plan = entry.data?.plan;
    if (plan === undefined) {
      process.stdout.write(`seq ${entry.seq}: plan data missing\n`);
      continue;
    }
    const missing = required.filter((key) => !(key in plan));
    if (missing.length > 0) {
      process.stdout.write(`seq ${entry.seq}: plan ${plan.id} missing ${missing.join(", ")}\n`);
      continue;
    }
    const taskKeys = new Set();
    let cycle = false;
    for (const task of plan.tasks) {
      if (taskKeys.has(task.key)) {
        process.stdout.write(`seq ${entry.seq}: duplicate task key ${task.key}\n`);
        cycle = true;
        break;
      }
      taskKeys.add(task.key);
      for (const dep of task.dependencies ?? []) {
        if (!taskKeys.has(dep)) {
          process.stdout.write(`seq ${entry.seq}: task ${task.key} depends on unknown ${dep}\n`);
          cycle = true;
        }
      }
    }
    if (cycle) continue;
    process.stdout.write(`seq ${entry.seq}: plan ${plan.id} ok (${plan.tasks.length} tasks)\n`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const path = args._[1];
  if (command === undefined || path === undefined) usage();

  const abs = resolve(path);
  await stat(abs); // surfaces ENOENT early

  switch (command) {
    case "tail": {
      const n = Number.parseInt(args.flags.n ?? "20", 10);
      await cmdTail(abs, Number.isFinite(n) && n > 0 ? n : 20);
      break;
    }
    case "event": {
      if (args.flags.event === undefined) usage();
      await cmdEvent(abs, args.flags.event);
      break;
    }
    case "workflow": {
      if (args.flags.id === undefined) usage();
      await cmdWorkflow(abs, args.flags.id);
      break;
    }
    case "plan": {
      await cmdPlan(abs);
      break;
    }
    default:
      usage();
  }
}

main().catch((error) => {
  process.stderr.write(`inspect-ledger: ${error.message}\n`);
  process.exit(1);
});

#!/usr/bin/env node

// The v1 custom tar writer produced non-standard archives and is deliberately disabled. T06 in
// PRODUCTION_RELEASE_PLAN.md replaces it with a standard, independently verified artifact pipeline.

process.stderr.write(
  "package-skill: disabled during the 2.0.0 production rebuild; see PRODUCTION_RELEASE_PLAN.md T06\n",
);
process.exitCode = 1;

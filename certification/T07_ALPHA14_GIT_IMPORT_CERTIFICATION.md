# T07 alpha.14 public Git import certification

Verdict: **PARTIAL — public Git import, restart persistence, and imported MCP activation passed; full T07 remains BLOCKED**

This receipt binds the public Git import route to source `95b79d4d674d430fb0ad7d71b7a61b5f4c6ed52b`.
It is not a production-release decision and does not certify the remaining workflow matrix.

## Candidate and channel

- Public branch: `main` at `95b79d4d674d430fb0ad7d71b7a61b5f4c6ed52b` after an owner-authorized
  normal fast-forward from the previous public baseline.
- Canonical TGZ: `minimax-code-cycle-plugin-2.0.0-alpha.14.tgz`, 1,897,838 bytes, SHA-256
  `5ec0c27f79066fc25a3ce823d2e11b9be0442677c6dcdf5da77d6814f11cfbcb`.
- Deterministic Skill archive: `cycle-skill-2.0.0-alpha.14.zip`, 41,919 bytes, SHA-256
  `2b35cd5467e72a555124671cf9fa659bcb33fdf845dee623a5037abf3f1802ba`.
- Host: Windows x64, MiniMax Code Desktop `3.0.68.134`, MiniMax-M3, temporary Mavis runtime.

## Passed live evidence

1. The supported **Plugins -> Personal -> Create -> Import plugin from a Git repository** route
   previewed the public source as `minimax-code-cycle-plugin` `2.0.0-alpha.14`, with one Skill and
   one MCP server.
2. The native Import action completed. The Personal plugin catalog and details panel both showed the
   imported plugin, Skill `cycle`, MCP `cycle-tools`, and version `2.0.0-alpha.14`.
3. A complete Desktop process restart retained the imported plugin in the same temporary runtime.
4. A fresh task selected the imported plugin. Its read-only `cycle_doctor` call returned
   `version: 2.0.0-alpha.14`, `schemaVersion: 8`, and `ok: true`, with an intact history chain and
   no reported findings. No setup, role creation, workflow, or file mutation was requested.

## Boundaries and remaining gates

- The native Git import establishes a supported distribution candidate. The local Skill ZIP remains
  an integrity artifact, not a MiniMax local-install channel.
- The installed checkout's raw byte hash was not exposed by the host UI; equivalence is supported by
  the public branch SHA, imported manifest version/components, and the independent local artifact
  hashes above, but it is not a direct installed-file digest.
- Quick/full workflows, repair and retry paths, pause/resume, provider failure, concurrent projects,
  candidate delivery, state persistence, uninstall, executor allowed write, and the 20-run critical
  battery remain unproved.

The only valid overall release decision remains **BLOCKED** until the remaining T07 matrix and the
post-publication clean-install evidence contract are complete. Raw prompts, local paths, account
details, session identifiers, and process output are omitted from the machine-readable receipt.

## Correction recorded 2026-09-10

The Skill archive digest above is **not a reproducible value** and must not be used to establish
that a later archive is the same artifact.

`fflate` renders the ZIP MS-DOS timestamp with local-time getters, and the packer handed it a fixed
UTC instant, so the bytes depended on the timezone of the machine that packed. Measured across six
zones: UTC stamped `1980-01-01 00:00`, UTC+1 stamped `01:00`, and every zone west of UTC stamped
1979 - below the year the format counts from - where the year field goes negative and reads back as
2107. One commit produced at least three different archives, and the two-build test could not see it
because both builds ran on one machine.

The observation above is left as recorded: it is what was seen that day. What it cannot support is
the equivalence claim that a fixed digest normally carries.

The packer now builds the stamp from local components fixed at `1980-01-01 00:00`, which renders
identically in every zone; verified from UTC-11 to UTC+14, including a half-hour offset.

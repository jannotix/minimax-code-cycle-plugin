import assert from "node:assert/strict"
import { test } from "node:test"

import { inspectAcl } from "../src/store/checkpoints.ts"

const PATH = "C:\\Users\\u\\AppData\\Local\\Cycle\\keys\\checkpoint.pem"

const acl = (...lines: readonly string[]): string =>
  `${PATH} ${lines[0]}\n${lines.slice(1).map((line) => `                 ${line}`).join("\n")}\n\n` +
  "Successfully processed 1 files; Failed processing 0 files\n"

// What the key is protected from is another person reading it and forging a checkpoint. SYSTEM and
// the Administrators group are not that: on Windows an administrator can take ownership of any file
// whatever its ACL, so refusing them is theatre — and the POSIX side already concedes the same
// point, because 0600 does not keep root out either. Holding the two platforms to different
// standards for one property is what made this refuse an ordinary Windows machine.
test("the well-known system principals do not make a key loose", () => {
  const report = inspectAcl(
    acl("DESKTOP\\u:(F)", "NT AUTHORITY\\SYSTEM:(F)", "BUILTIN\\Administrators:(F)"),
    PATH,
  )
  assert.equal(report.restricted, true, report.detail)
})

test("a second ordinary account makes it loose, and is named", () => {
  const report = inspectAcl(
    acl("DESKTOP\\u:(F)", "NT AUTHORITY\\SYSTEM:(F)", "DESKTOP\\someone-else:(R)"),
    PATH,
  )
  assert.equal(report.restricted, false)
  // A count cannot be acted on. The account is what a reader has to remove.
  assert.match(report.detail, /someone-else/u)
  assert.doesNotMatch(report.detail, /SYSTEM/u)
})

test("a group that means everybody is refused however it is spelled", () => {
  for (const group of ["Everyone:(R)", "BUILTIN\\Users:(RX)", "NT AUTHORITY\\Authenticated Users:(M)"]) {
    const report = inspectAcl(acl("DESKTOP\\u:(F)", group), PATH)
    assert.equal(report.restricted, false, `${group} must not pass`)
  }
})

// An inherited entry is the state this check exists to catch: it means the key kept whatever the
// directory above it grants, which on a shared machine is several accounts with Modify.
test("an inherited entry is refused whoever it belongs to", () => {
  const report = inspectAcl(acl("DESKTOP\\u:(I)(F)", "NT AUTHORITY\\SYSTEM:(I)(F)"), PATH)
  assert.equal(report.restricted, false)
  assert.match(report.detail, /inherited/iu)
})

// Names carry spaces and backslashes, and the first line carries the path in front of the first
// entry. Parsing on whitespace alone reads "NT AUTHORITY\SYSTEM" as "AUTHORITY\SYSTEM".
test("principals are read whole, including the one beside the path", () => {
  const report = inspectAcl(
    acl("DESKTOP\\u:(F)", "NT AUTHORITY\\SYSTEM:(F)", "DESKTOP\\Domain Admins:(F)"),
    PATH,
  )
  assert.equal(report.restricted, false)
  assert.match(report.detail, /Domain Admins/u)
})

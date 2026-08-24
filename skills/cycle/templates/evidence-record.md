# Evidence: <id>

Evidence id: <uuid>
Candidate id: <uuid>
Kind: <build | test | lint | typecheck | browser | static-analysis | manual>
Command: <the exact command that was run>
Exit code: <int>
Started at: <iso8601>
Duration ms: <int>
Output digest: <sha256>
Status: passed | failed | skipped
Notes: <one paragraph>

## Command

```
<the command, exactly as the executor ran it>
```

## Output (truncated to relevant lines)

```
<excerpt of stdout and stderr, enough for a reviewer to understand the result>
```

## Attachments

- <path/to/screenshot.png>
- <path/to/dom.html>

## Notes for reviewers

<what the reviewer should know that the output does not already say.
The output digest is a hash; if the reviewer wants the full output,
they replay the command.>

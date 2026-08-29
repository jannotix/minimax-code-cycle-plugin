# Supported languages

The allowlist is fixed in `src/intel/languages.ts`. Every parser is a bundled MIT-licensed WASM
artifact recorded by SHA-256 in `vendor/manifest.json`.

| Graph language | Extensions | Bundled grammar |
|---|---|---|
| TypeScript | `.ts`, `.mts`, `.cts` | `typescript.wasm` |
| TSX | `.tsx`, `.jsx` | `tsx.wasm` |
| JavaScript | `.js`, `.mjs`, `.cjs` | `javascript.wasm` |
| Python | `.py`, `.pyi` | `python.wasm` |
| Go | `.go` | `go.wasm` |
| Rust | `.rs` | `rust.wasm` |
| Java | `.java` | `java.wasm` |
| C# | `.cs` | `c-sharp.wasm` |
| C and C++ | `.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx` | `cpp.wasm` |
| Ruby | `.rb` | `ruby.wasm` |
| PHP | `.php` | `php.wasm` |
| CSS | `.css` | `css.wasm` |

Other files are not recorded as opaque blobs and do not appear in graph status. Adding a language
requires a bundled grammar with provenance, extraction rules, an allowlisted extension, and tests
that parse representative source and exercise its structural nodes.

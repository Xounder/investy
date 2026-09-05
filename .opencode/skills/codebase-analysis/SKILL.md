---
name: codebase-analysis
description: >
  Scans all TypeScript/TSX source files using tree-sitter (with regex fallback)
  to extract structural information — imports, exports, function/class/interface/type
  declarations, React components, and dependency maps.
---

# Codebase Analysis Skill — JobFindr

## When to use

Load this skill to:

- Generate a full structural map of the codebase
- Discover all exported functions, types, interfaces, and classes
- Count and categorize declarations per package
- Audit dependency usage across the project
- Identify React components, hooks, and utilities

## How it works

The skill bundles a self-contained script at `scripts/scan.mjs` that:

1. Installs tree-sitter + TypeScript grammars on first run
2. Walks `apps/frontend/src/`, `apps/backend/src/`, `packages/*/src/`
3. Parses each `.ts`/`.tsx` file with tree-sitter (falls back to regex if native compilation fails)
4. Extracts imports, exports, function/class/interface/type declarations, arrow functions, React components
5. Aggregates per-package metrics and top dependencies
6. Outputs a structured JSON report + human-readable text

## Scan Modes

| Mode | What it scans | Extensions | Excludes |
|------|---------------|------------|----------|
| `implementation` (default) | `apps/frontend/src`, `apps/backend/src`, `packages/*/src` | `.ts`, `.tsx` | `node_modules`, `dist`, `.opencode`, `*.test.*`, `*.d.ts` |
| `docs` | `.opencode/` (all docs) | `.md`, `.mdx`, `.txt`, `.json`, `.yaml`, `.yml` | `.opencode/plan/` |
| `all` | Both modes, generates separate + combined reports | — | — |

## Usage

```powershell
$scripts = ".opencode\skills\codebase-analysis\scripts"
Set-Location $scripts
pnpm install

# Implementation (source code) — default
node scan.mjs

# Documentation (.opencode/ folder)
node scan.mjs --mode docs

# Both modes
node scan.mjs --mode all
```


If `pnpm install` fails due to native compilation:

```powershell
npm install
node scan.mjs
```

## Options

| Flag | Effect |
|------|--------|
| `--mode <name>` | Scan mode: `implementation`, `docs`, or `all` (default: `implementation`) |
| `--json-only` | Output only JSON (no human-readable report) |
| `--no-save` | Don't save output files |
| `--include-tests` | Include test files in scan (implementation mode only) |
| `--help` | Show help |

## Output

Reports are saved to `output/` with naming:

| Mode | File pattern |
|------|-------------|
| `implementation` | `implementation-report-{timestamp}.json` / `.md` |
| `docs` | `docs-report-{timestamp}.json` / `.md` |
| `all` | `combined-report-{timestamp}.json` / `.md` + both individual reports |

## Implementation Report

- **stdout**: human-readable report with overview, per-package breakdown, top dependencies, exported API surface, and parse errors
- Parsed with tree-sitter (falls back to regex)
- Extracts: imports, exports, function/class/interface/type declarations, arrow functions, React components

## Documentation Report

- **stdout**: overview of all `.opencode/` docs, heading inventory, code block languages, duplicate heading detection
- Parsed with a lightweight doc info extractor (no tree-sitter needed)
- Extracts: markdown headings/sections/code blocks/list items, JSON/YAML top keys, text word counts

## Rules

- Read-only — no source files are modified
- Parse errors are reported but never halt the scan
- Reports are timestamped and accumulate in `output/`

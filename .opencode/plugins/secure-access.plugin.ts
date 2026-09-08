import type { Plugin } from "@opencode-ai/plugin"
import { resolve, sep } from "path"
import { realpathSync, existsSync } from "fs"

// --- Types (Fase 30 + 31) ---

type ArgType = "path" | "flag" | "content" | "pattern"

interface ClassifiedArg {
  value: string
  type: ArgType
}

interface ParsedCommand {
  type: string
  args: string[]
}

interface CommandRule {
  pattern: RegExp
  type: string
  validate?: (tokens: string[], classified: ClassifiedArg[]) => boolean
}

// --- Utilities ---

const hasChaining = (cmd: string): boolean => {
  const noQuotes = cmd.replace(/(['"])(?:(?!\1|\\).|\\.)*\1/g, "")
  return /&&|\|\||;|\||`|\$\(|\$\{|\n|\r|%0A|%0D/.test(noQuotes)
}

const safeRealPath = (target: string): string | null => {
  try {
    return realpathSync(target)
  } catch {
    return null
  }
}

// --- Tokenization ---

const tokenize = (cmd: string): string[] => {
  const tokens: string[] = []
  let i = 0
  while (i < cmd.length) {
    if (cmd[i] === " " || cmd[i] === "\t") { i++; continue }

    let token = ""
    while (i < cmd.length) {
      const c = cmd[i]
      if (c === "'" || c === '"') {
        const quote = c
        i++
        while (i < cmd.length) {
          if (cmd[i] === quote) { i++; break }
          if (cmd[i] === "\\" && i + 1 < cmd.length && quote === '"') {
            token += cmd[i + 1]
            i += 2
          } else {
            token += cmd[i]
            i++
          }
        }
      } else if (c === " " || c === "\t") {
        i++
        break
      } else {
        token += c
        i++
      }
    }
    tokens.push(token)
  }
  return tokens
}

const stripQuotes = (s: string): string => {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1)
  }
  return s
}

const nonFlagArgs = (tokens: string[]): string[] =>
  tokens.filter(t => !t.startsWith("-") && !t.startsWith("/"))

// --- Path classification (Fase 31) ---

const classifyArg = (token: string): ClassifiedArg => {
  if (token.startsWith("-") || token.startsWith("/")) {
    return { value: token, type: "flag" }
  }
  if (/[*?[\]{}]/.test(token)) {
    return { value: token, type: "pattern" }
  }
  return { value: token, type: "path" }
}

// --- Git semantic validation (Fase 29) ---

const gitHandlers: Record<string, (classified: ClassifiedArg[]) => boolean> = {
  status: () => true,
  diff: () => true,
  log: () => true,
  add: (c) => c.some(a => a.type === "path"),
  commit: (c) => {
    const mIdx = c.findIndex(a => a.value === "-m" || a.value === "--message")
    if (mIdx === -1) return false
    return mIdx < c.length - 1
  },
  checkout: (c) => c.some(a => a.type !== "flag"),
  restore: (c) => c.some(a => a.type === "path"),
  push: (c) => !c.some(a => a.value.includes("--exec")),
  pull: (c) => !c.some(a => a.value.includes("--upload-pack")),
  branch: () => true,
  fetch: () => true,
  merge: (c) => !c.some(a => a.value.includes("--receive-pack")),
  rebase: () => true,
  stash: () => true,
  reset: () => true,
  show: () => true,
  tag: () => true,
  init: () => true,
  remote: () => true,
}

// --- Command rules (Fase 30) ---

const commandRules: CommandRule[] = [
  { pattern: /^pnpm --filter (frontend|backend|@jobfindr\/types|@jobfindr\/utils)\s+(dev|build|start|lint|typecheck|test|preview|clean)$/i, type: "pnpm-filter" },
  { pattern: /^pnpm --filter @brkroutnxdle\/(shared|domain|calendar|ui|api|web)\s+(build|dev|start|test|typecheck|lint)$/i, type: "pnpm-filter" },
  { pattern: /^pnpm --filter @brkroutnxdle\/api exec tsx\s+\S+\.ts$/i, type: "pnpm-exec" },
  { pattern: /^pnpm --filter backend exec tsx \.\.\/frontend\/playwright-check\.ts$/i, type: "pnpm-pw-check" },
  { pattern: /^pnpm install$/i, type: "pnpm-install" },
  { pattern: /^pnpm test$/i, type: "pnpm-test" },
  { pattern: /^pnpm build$/i, type: "pnpm-build" },
  { pattern: /^pnpm dev$/i, type: "pnpm-dev" },
  { pattern: /^pnpm typecheck$/i, type: "pnpm-typecheck" },
  { pattern: /^pnpm lint$/i, type: "pnpm-lint" },
  { pattern: /^pnpm run\s+\S+(\s+.*)?$/i, type: "pnpm-run" },
  { pattern: /^docker compose (up|down|build)$/i, type: "docker-compose" },
  { pattern: /^npx playwright .+$/i, type: "npx-playwright" },
  { pattern: /^(?:\.\\node_modules\\.bin\\)?vitest(?:\.(?:CMD|ps1))? run(?:\s+.*)?$/i, type: "vitest-run" },
  { pattern: /^powershell -c "\[System\.Console\]::Beep\(\d+, \d+\)"$/i, type: "powershell-beep" },
  {
    pattern: /^git\s+(\S+)(?:\s+.*)?$/i,
    type: "git",
    validate: (tokens, classified) => {
      const subcmd = tokens[1]?.toLowerCase()
      if (!subcmd || !gitHandlers[subcmd]) return false
      const rest = tokens.slice(2).join(" ")
      if (/&&|\|\||[;|]|`|\$\(|\$\{/.test(rest)) return false
      return gitHandlers[subcmd](classified.slice(2))
    },
  },
  {
    pattern: /^(node|tsx)\s+(\S+)/i,
    type: "exec",
    validate: (tokens) => {
      if (tokens.length < 2) return false
      if (tokens[1].startsWith("-")) return false
      for (const arg of tokens.slice(2)) {
        if (["-e", "--eval", "--require", "--inspect", "--inspect-brk"].includes(arg)) return false
      }
      return true
    },
  },
  { pattern: /^cd\s+(\S+)$/i, type: "cd" },
  { pattern: /^rm\s+(-[rf]+\s+)?(\S+)$/i, type: "rm" },
  { pattern: /^del\s+(\/[a-z]+\s+)?(\S+)$/i, type: "del" },
  { pattern: /^mkdir\s+(-p\s+)?(\S+)$/i, type: "mkdir" },
  { pattern: /^Remove-Item\s+(.+)$/i, type: "remove-item" },
  { pattern: /^Copy-Item\s+(.+)$/i, type: "copy-item" },
  { pattern: /^Move-Item\s+(.+)$/i, type: "move-item" },
  { pattern: /^Set-Content\s+(.+)$/i, type: "set-content" },
  { pattern: /^New-Item\s+(.+)$/i, type: "new-item" },
  { pattern: /^cat\s+\S+$/i, type: "cat" },
  { pattern: /^ls(?:\s+\S*)?$/i, type: "ls" },
  { pattern: /^which\s+\S+$/i, type: "which" },
  { pattern: /^where\s+\S+$/i, type: "where" },
  { pattern: /^echo\s+.+$/i, type: "echo" },
  { pattern: /^type\s+\S+$/i, type: "type" },
  { pattern: /^Get-ChildItem\s+.+$/i, type: "get-childitem" },
  { pattern: /^Get-Content\s+.+$/i, type: "get-content" },
  { pattern: /^Get-Command\s+.+$/i, type: "get-command" },
  { pattern: /^Test-Path\s+.+$/i, type: "test-path" },
  { pattern: /^rm\s+-rf\s+node_modules$/i, type: "rm-node-modules" },
  { pattern: /^Stop-Process\s+-Name\s+(node|tsx)(\s+-Force)?$/i, type: "stop-process" },
  { pattern: /^taskkill\s+\/F\s+\/IM\s+(node|tsx)(\.exe)?$/i, type: "stop-process" },
  {
    pattern: /^curl\s+/i,
    type: "curl",
    validate: (tokens) => {
      const args = tokens.slice(1)
      const dangerousFlags = ["-o", "--output", "-O", "--remote-name", "--config", "-K", "--help", "--manual"]
      for (const arg of args) {
        if (dangerousFlags.includes(arg)) return false
      }
      const url = args.find(a => a.startsWith("http"))
      if (!url) return false
      return /localhost/i.test(url)
    },
  },
]

// --- Parser (Fase 30) ---

const parseCommand = (cmd: string): ParsedCommand | null => {
  for (const rule of commandRules) {
    const match = cmd.match(rule.pattern)
    if (match) {
      if (rule.validate) {
        const tokens = tokenize(cmd)
        const classified = tokens.map(classifyArg)
        if (!rule.validate(tokens, classified)) {
          throw new Error(`[secure-access] Blocked command validation:\n${cmd}`)
        }
      }
      const args = match.slice(1).filter((a): a is string => a !== undefined)
      return { type: rule.type, args }
    }
  }
  return null
}

// --- Path validation (Fase 46: prefix-based strict boundary) ---

export const createPathValidator = (projectDir: string) => {
  const projectRoot = resolve(projectDir)
  const projectReal = safeRealPath(projectRoot)
  const projectBoundary = projectReal === null ? null : projectReal + sep

  return (target: string): boolean => {
    if (projectBoundary === null) return false

    // Fase 32: Block UNC paths
    if (/^\\\\/.test(target)) return false

    // Fase 54: Block empty, dot-only, and root paths
    if (target === "" || target === "." || target === "..") return false

    const resolved = resolve(projectRoot, target)
    const real = safeRealPath(resolved)
    if (real === null) {
      return resolved.startsWith(projectBoundary) || resolved === projectReal
    }
    return real.startsWith(projectBoundary) || real === projectReal
  }
}

type PathValidator = ReturnType<typeof createPathValidator>

// --- Plugin ---

export const SecureAccessPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  const isPathInsideProject = createPathValidator(directory)

  const fileToolArgs: Record<string, string[]> = {
    read: ["filePath", "path"],
    write: ["filePath", "path"],
    edit: ["filePath", "path"],
    glob: ["cwd", "path"],
    grep: ["cwd", "path"],
  }

  return {
    "tool.execute.before": async (input, output) => {
      const args = (output.args ?? {}) as Record<string, unknown>

      const toolKeys = fileToolArgs[input.tool]
      if (toolKeys) {
        for (const key of toolKeys) {
          const val = args[key]
          if (typeof val === "string") {
            if ((input.tool === "glob" || input.tool === "grep") && (val.includes("..") || val.startsWith("/"))) {
              throw new Error(`[secure-access] Blocked invalid ${input.tool} path:\n${val}`)
            }
            if (!isPathInsideProject(val)) {
              throw new Error(
                `[secure-access] Blocked ${input.tool} outside project:\n${val}`
              )
            }
          }
        }
      }

      if (input.tool !== "bash") return

      const command = (args.command as string ?? "").trim()
      if (!command) return

      // Fase 28: Block chaining (with quote-aware detection)
      if (hasChaining(command)) {
        throw new Error(`[secure-access] Blocked chained command:\n${command}`)
      }

      // Normalize command before parsing
      let normalized: string
      try {
        normalized = decodeURIComponent(command)
      } catch {
        normalized = command
      }
      normalized = normalized
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")

      // Treat `rtk` as a git shim alias: `rtk git <subcommand>` behaves as `git <subcommand>`.
      // This matches the real command the shell produces when `git` is invoked.
      if (/^rtk\s+git(?:\s+|$)/i.test(normalized)) {
        normalized = normalized.replace(/^rtk\s+/i, "")
      }

      // Parse command
      const parsed = parseCommand(normalized)
      if (!parsed) {
        throw new Error(`[secure-access] Blocked undocumented command:\n${command}`)
      }

      // --- Validators per type ---

      // stop-process is always allowed (only matches node/tsx)
      if (parsed.type === "stop-process") {
        return
      }

      // Fase 27: node/tsx – validate script path, extension, and existence
      if (parsed.type === "exec") {
        const resolveScript = (base: string) => {
          const fullPath = resolve(directory, base, parsed.args[1])
          if (existsSync(fullPath)) return safeRealPath(fullPath)
          return null
        }
        const real = resolveScript(directory) ?? resolveScript(args.workdir as string)
        if (!real) {
          // File not found via directory or workdir; validate the path is within project boundary
          const scriptPath = resolve(directory, parsed.args[1])
          if (!isPathInsideProject(scriptPath)) {
            throw new Error(
              `[secure-access] Blocked ${parsed.args[0]} outside project:\n${parsed.args[1]}`
            )
          }
          if (/\.(exe|com|bat|ps1|sh|dll)$/i.test(parsed.args[1])) {
            throw new Error(
              `[secure-access] Blocked ${parsed.args[0]} with dangerous extension:\n${parsed.args[1]}`
            )
          }
        } else {
          if (!isPathInsideProject(real)) {
            throw new Error(
              `[secure-access] Blocked ${parsed.args[0]} outside project:\n${parsed.args[1]}`
            )
          }
          if (!/\.(ts|js|tsx|mjs|cjs)$/i.test(real)) {
            throw new Error(
              `[secure-access] Blocked ${parsed.args[0]} with invalid extension:\n${real}`
            )
          }
        }
      }

      if (parsed.type === "cd") {
        const target = parsed.args[0]
        if (!isPathInsideProject(target)) {
          throw new Error(`[secure-access] Blocked cd outside project:\n${target}`)
        }
      }

      if (parsed.type === "rm") {
        const target = parsed.args[1] ?? parsed.args[0]
        if (target && target !== "node_modules" && !isPathInsideProject(target)) {
          throw new Error(`[secure-access] Blocked rm outside project:\n${command}`)
        }
      }

      if (parsed.type === "del") {
        const target = parsed.args[1] ?? parsed.args[0]
        if (target && !isPathInsideProject(target)) {
          throw new Error(`[secure-access] Blocked del outside project:\n${command}`)
        }
      }

      if (parsed.type === "remove-item") {
        const tokens = tokenize(parsed.args[0])
        const paths = tokens
          .map(classifyArg)
          .filter(a => a.type === "path")
          .map(a => stripQuotes(a.value))
        for (const p of paths) {
          if (!isPathInsideProject(p)) {
            throw new Error(`[secure-access] Blocked Remove-Item outside project:\n${command}`)
          }
        }
      }

      if (parsed.type === "mkdir") {
        const target = parsed.args[1] ?? parsed.args[0]
        if (target && !isPathInsideProject(target)) {
          throw new Error(`[secure-access] Blocked mkdir outside project:\n${target}`)
        }
      }

      // Fase 26: Copy-Item / Move-Item – positional parsing
      if (parsed.type === "copy-item" || parsed.type === "move-item") {
        const tokens = tokenize(parsed.args[0])
        const paths = tokens
          .map(classifyArg)
          .filter(a => a.type === "path")
          .map(a => stripQuotes(a.value))
        if (paths.length > 0 && !isPathInsideProject(paths[0])) {
          throw new Error(
            `[secure-access] Blocked ${parsed.type} targeting outside project:\n${command}`
          )
        }
        if (paths.length > 1 && !isPathInsideProject(paths[1])) {
          throw new Error(
            `[secure-access] Blocked ${parsed.type} targeting outside project:\n${command}`
          )
        }
      }

      // Fase 25 + 42: Set-Content – only first path-classified arg is target
      if (parsed.type === "set-content") {
        const tokens = tokenize(parsed.args[0])
        const target = tokens
          .map(classifyArg)
          .filter(a => a.type === "path")
          .map(a => stripQuotes(a.value))[0]
        if (target && !isPathInsideProject(target)) {
          throw new Error(`[secure-access] Blocked Set-Content outside project:\n${command}`)
        }
      }

      // Fase 25 + 42: New-Item – only first path-classified arg is target
      if (parsed.type === "new-item") {
        const tokens = tokenize(parsed.args[0])
        const target = tokens
          .map(classifyArg)
          .filter(a => a.type === "path")
          .map(a => stripQuotes(a.value))[0]
        if (target && !isPathInsideProject(target)) {
          throw new Error(`[secure-access] Blocked New-Item outside project:\n${command}`)
        }
      }
    }
  }
}

// --- Self-test for TS error paths ---

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

export function runPluginTests(): TestResult[] {
  const results: TestResult[] = []

  const test = (name: string, fn: () => void) => {
    try {
      fn()
      results.push({ name, passed: true })
    } catch (e) {
      results.push({ name, passed: false, error: (e as Error).message })
    }
  }

  // Chaining detection
  test("blocks && chaining", () => {
    if (!hasChaining("echo a && echo b")) throw new Error("should detect &&")
    if (hasChaining('echo "a && b"')) throw new Error("should allow && in quotes")
  })

  test("blocks || chaining", () => {
    if (!hasChaining("echo a || echo b")) throw new Error("should detect ||")
    if (hasChaining('echo "a || b"')) throw new Error("should allow || in quotes")
  })

  test("blocks | pipe", () => {
    if (!hasChaining("echo a | echo b")) throw new Error("should detect |")
  })

  test("blocks ; semicolon chaining", () => {
    if (!hasChaining("echo a; echo b")) throw new Error("should detect ;")
  })

  test("blocks backtick command substitution", () => {
    if (!hasChaining("echo `whoami`")) throw new Error("should detect backticks")
  })

  test("blocks $() command substitution", () => {
    if (!hasChaining("echo $(whoami)")) throw new Error("should detect $()")
  })

  test("blocks ${} substitution", () => {
    if (!hasChaining("echo ${HOME}")) throw new Error("should detect ${}")
  })

  test("blocks newline chaining", () => {
    if (!hasChaining("echo a\n echo b")) throw new Error("should detect newline")
    if (!hasChaining("echo a\r echo b")) throw new Error("should detect carriage return")
  })

  test("blocks URL-encoded newline", () => {
    if (!hasChaining("echo a%0Aecho b")) throw new Error("should detect %0A")
    if (!hasChaining("echo a%0Decho b")) throw new Error("should detect %0D")
  })

  test("allows safe redirect in quotes", () => {
    if (hasChaining('echo "2>&1"')) throw new Error("should allow redirect in quotes")
  })

  test("allows simple command without chaining", () => {
    if (hasChaining("echo hello world")) throw new Error("should allow simple command")
  })

  // Path validation
  const validator = createPathValidator(process.cwd())

  test("allows path inside project", () => {
    if (!validator("apps/web/src")) throw new Error("should allow project path")
  })

  test("blocks path outside project", () => {
    if (validator("C:\\Windows\\System32")) throw new Error("should block system path")
  })

  test("blocks empty path", () => {
    if (validator("")) throw new Error("should block empty path")
  })

  test("blocks dot path", () => {
    if (validator(".")) throw new Error("should block dot path")
  })

  test("blocks dotdot path", () => {
    if (validator("..")) throw new Error("should block parent path")
  })

  test("blocks UNC path", () => {
    if (validator("\\\\server\\share\\file")) throw new Error("should block UNC path")
  })

  test("blocks root path", () => {
    if (validator("C:\\")) throw new Error("should block root path")
  })

  // exec validation
  test("blocks node with -e flag", () => {
    const tokens = ["node", "-e", "console.log(1)"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.pattern.test("node script.js"))
    if (rule?.validate) {
      if (rule.validate(tokens, classified) !== false) throw new Error("should return false for -e flag")
    }
  })

  test("blocks node with --eval flag", () => {
    const tokens = ["node", "--eval", "console.log(1)"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.pattern.test("node script.js"))
    if (rule?.validate) {
      if (rule.validate(tokens, classified) !== false) throw new Error("should block --eval")
    }
  })

  test("blocks node with --require flag", () => {
    const tokens = ["node", "script.js", "--require", "hook.js"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.pattern.test("node script.js"))
    if (rule?.validate) {
      if (rule.validate(tokens, classified) !== false) throw new Error("should block --require")
    }
  })

  test("blocks node with --inspect flag", () => {
    const tokens = ["node", "script.js", "--inspect"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.pattern.test("node script.js"))
    if (rule?.validate) {
      if (rule.validate(tokens, classified) !== false) throw new Error("should block --inspect")
    }
  })

  test("blocks node with --inspect-brk flag", () => {
    const tokens = ["node", "script.js", "--inspect-brk"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.pattern.test("node script.js"))
    if (rule?.validate) {
      if (rule.validate(tokens, classified) !== false) throw new Error("should block --inspect-brk")
    }
  })

  test("blocks node with bare flag as script", () => {
    const tokens = ["node", "-v"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.pattern.test("node script.js"))
    if (rule?.validate) {
      if (rule.validate(tokens, classified) !== false) throw new Error("should block bare flag")
    }
  })

  test("allows node with valid script", () => {
    const tokens = ["node", "script.js"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.pattern.test("node script.js"))
    if (!rule?.validate || rule.validate(tokens, classified) !== true) throw new Error("should allow valid script")
  })

  // git validation
  test("blocks git commit without -m", () => {
    const tokens = ["git", "commit"]
    const classified = tokens.map(classifyArg)
    const handler = gitHandlers["commit"]
    if (handler && handler(classified.slice(2))) throw new Error("should block commit without -m")
  })

  test("allows git commit with -m", () => {
    const tokens = ["git", "commit", "-m", "message"]
    const classified = tokens.map(classifyArg)
    const handler = gitHandlers["commit"]
    if (!handler || !handler(classified.slice(2))) throw new Error("should allow commit with -m")
  })

  test("allows git status", () => {
    const tokens = ["git", "status"]
    const classified = tokens.map(classifyArg)
    const handler = gitHandlers["status"]
    if (!handler || !handler(classified.slice(2))) throw new Error("should allow status")
  })

  test("allows git diff", () => {
    const handler = gitHandlers["diff"]
    if (!handler || !handler([])) throw new Error("should allow diff")
  })

  test("allows git log", () => {
    const handler = gitHandlers["log"]
    if (!handler || !handler([])) throw new Error("should allow log")
  })

  test("blocks git add without path", () => {
    const handler = gitHandlers["add"]
    const classified = [classifyArg("-A")]
    if (handler && handler(classified)) throw new Error("should block add with only flags")
  })

  test("allows git add with path", () => {
    const handler = gitHandlers["add"]
    const classified = [classifyArg("src/file.ts")]
    if (!handler || !handler(classified)) throw new Error("should allow add with path")
  })

  test("blocks git checkout without non-flag arg", () => {
    const handler = gitHandlers["checkout"]
    const classified = [classifyArg("-b")]
    if (handler && handler(classified)) throw new Error("should block checkout with only flags")
  })

  test("allows git checkout with branch name", () => {
    const handler = gitHandlers["checkout"]
    const classified = [classifyArg("main")]
    if (!handler || !handler(classified)) throw new Error("should allow checkout with branch")
  })

  test("blocks git push with --exec", () => {
    const handler = gitHandlers["push"]
    const classified = [classifyArg("origin"), classifyArg("main"), classifyArg("--exec=ssh")]
    if (handler && handler(classified)) throw new Error("should block push with --exec")
  })

  test("allows git push without --exec", () => {
    const handler = gitHandlers["push"]
    const classified = [classifyArg("origin"), classifyArg("main")]
    if (!handler || !handler(classified)) throw new Error("should allow push without --exec")
  })

  test("blocks git pull with --upload-pack", () => {
    const handler = gitHandlers["pull"]
    const classified = [classifyArg("origin"), classifyArg("--upload-pack=something")]
    if (handler && handler(classified)) throw new Error("should block pull with --upload-pack")
  })

  test("blocks git merge with --receive-pack", () => {
    const handler = gitHandlers["merge"]
    const classified = [classifyArg("--receive-pack=something")]
    if (handler && handler(classified)) throw new Error("should block merge with --receive-pack")
  })

  test("blocks git restore without path", () => {
    const handler = gitHandlers["restore"]
    const classified = [classifyArg("--staged")]
    if (handler && handler(classified)) throw new Error("should block restore without path")
  })

  test("allows git restore with path", () => {
    const handler = gitHandlers["restore"]
    const classified = [classifyArg("src/file.ts")]
    if (!handler || !handler(classified)) throw new Error("should allow restore with path")
  })

  test("allows git branch", () => {
    const handler = gitHandlers["branch"]
    if (!handler || !handler([])) throw new Error("should allow branch")
  })

  test("allows git fetch", () => {
    const handler = gitHandlers["fetch"]
    if (!handler || !handler([])) throw new Error("should allow fetch")
  })

  test("allows git stash", () => {
    const handler = gitHandlers["stash"]
    if (!handler || !handler([])) throw new Error("should allow stash")
  })

  test("allows git rebase", () => {
    const handler = gitHandlers["rebase"]
    if (!handler || !handler([])) throw new Error("should allow rebase")
  })

  test("allows git reset", () => {
    const handler = gitHandlers["reset"]
    if (!handler || !handler([])) throw new Error("should allow reset")
  })

  test("allows git show", () => {
    const handler = gitHandlers["show"]
    if (!handler || !handler([])) throw new Error("should allow show")
  })

  test("allows git tag", () => {
    const handler = gitHandlers["tag"]
    if (!handler || !handler([])) throw new Error("should allow tag")
  })

  test("allows git init", () => {
    const handler = gitHandlers["init"]
    if (!handler || !handler([])) throw new Error("should allow init")
  })

  test("allows git remote", () => {
    const handler = gitHandlers["remote"]
    if (!handler || !handler([])) throw new Error("should allow remote")
  })

  test("blocks unknown git subcommand", () => {
    const classified = [classifyArg("src/file.ts")]
    const handler = gitHandlers["unknown_cmd"]
    if (handler) throw new Error("unknown subcommand should not have a handler")
  })

  // curl validation
  test("blocks curl to non-localhost", () => {
    const tokens = ["curl", "https://evil.com"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.type === "curl")
    if (rule?.validate && rule.validate(tokens, classified)) throw new Error("should block non-localhost curl")
  })

  test("allows curl to localhost", () => {
    const tokens = ["curl", "http://localhost:3000/api"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.type === "curl")
    if (!rule?.validate || !rule.validate(tokens, classified)) throw new Error("should allow localhost curl")
  })

  test("blocks curl with -o flag", () => {
    const tokens = ["curl", "-o", "output.txt", "http://localhost:3000"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.type === "curl")
    if (rule?.validate && rule.validate(tokens, classified)) throw new Error("should block curl with -o")
  })

  test("blocks curl with --output flag", () => {
    const tokens = ["curl", "--output", "output.txt", "http://localhost:3000"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.type === "curl")
    if (rule?.validate && rule.validate(tokens, classified)) throw new Error("should block curl with --output")
  })

  test("blocks curl with -O flag", () => {
    const tokens = ["curl", "-O", "http://localhost:3000/file"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.type === "curl")
    if (rule?.validate && rule.validate(tokens, classified)) throw new Error("should block curl with -O")
  })

  test("blocks curl with --config flag", () => {
    const tokens = ["curl", "--config", "config.txt"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.type === "curl")
    if (rule?.validate && rule.validate(tokens, classified)) throw new Error("should block curl with --config")
  })

  test("blocks curl without URL", () => {
    const tokens = ["curl", "-v"]
    const classified = tokens.map(classifyArg)
    const rule = commandRules.find(r => r.type === "curl")
    if (rule?.validate && rule.validate(tokens, classified)) throw new Error("should block curl without URL")
  })

  // classifyArg
  test("classifies flag args with --", () => {
    const r = classifyArg("--force")
    if (r.type !== "flag") throw new Error("should classify --flag")
  })

  test("classifies flag args with /", () => {
    const r = classifyArg("/p")
    if (r.type !== "flag") throw new Error("should classify /flag")
  })

  test("classifies path args", () => {
    const r = classifyArg("apps/web/src")
    if (r.type !== "path") throw new Error("should classify as path")
  })

  test("classifies pattern args", () => {
    const r = classifyArg("src/**/*.ts")
    if (r.type !== "pattern") throw new Error("should classify as pattern")
  })

  // stripQuotes
  test("stripQuotes removes single quotes", () => {
    const r = stripQuotes("'hello'")
    if (r !== "hello") throw new Error(`expected "hello", got "${r}"`)
  })

  test("stripQuotes removes double quotes", () => {
    const r = stripQuotes('"hello"')
    if (r !== "hello") throw new Error(`expected "hello", got "${r}"`)
  })

  test("stripQuotes leaves unquoted unchanged", () => {
    const r = stripQuotes("hello")
    if (r !== "hello") throw new Error(`expected "hello", got "${r}"`)
  })

  test("stripQuotes leaves mismatched quotes", () => {
    const r = stripQuotes("'hello")
    if (r !== "'hello") throw new Error(`expected "'hello", got "${r}"`)
  })

  // tokenize
  test("tokenize splits simple command", () => {
    const r = tokenize("git status")
    if (r.length !== 2 || r[0] !== "git" || r[1] !== "status") throw new Error("wrong tokenization")
  })

  test("tokenize handles double-quoted string", () => {
    const r = tokenize('echo "hello world"')
    if (r.length !== 2 || r[1] !== "hello world") throw new Error("double quote tokenization failed")
  })

  test("tokenize handles single-quoted string", () => {
    const r = tokenize("echo 'hello world'")
    if (r.length !== 2 || r[1] !== "hello world") throw new Error("single quote tokenization failed")
  })

  test("tokenize handles escape inside double quotes", () => {
    const r = tokenize('echo "hello\\"world"')
    if (r.length !== 2 || r[1] !== 'hello"world') throw new Error("escape tokenization failed")
  })

  test("tokenize skips leading/trailing spaces", () => {
    const r = tokenize("  git  status  ")
    if (r.length !== 2 || r[0] !== "git" || r[1] !== "status") throw new Error("space trimming failed")
  })

  // parseCommand integration
  test("parseCommand returns type for pnpm build", () => {
    const r = parseCommand("pnpm build")
    if (!r || r.type !== "pnpm-build") throw new Error("should parse pnpm build")
  })

  test("parseCommand returns type for git status", () => {
    const r = parseCommand("git status")
    if (!r || r.type !== "git") throw new Error("should parse git status")
  })

  test("parseCommand returns null for undocumented command", () => {
    const r = parseCommand("sudo rm -rf /")
    if (r !== null) throw new Error("should return null for undocumented command")
  })

  test("parseCommand validates git subcommand", () => {
    let threw = false
    try { parseCommand("git unknown_subcmd") } catch { threw = true }
    if (!threw) throw new Error("should throw for unknown git subcommand")
  })

  // nonFlagArgs
  test("nonFlagArgs filters flags", () => {
    const r = nonFlagArgs(["--force", "file.txt", "-r"])
    if (r.length !== 1 || r[0] !== "file.txt") throw new Error("nonFlagArgs should filter flags")
  })

  return results
}

// Run self-test when executed directly
const isMain = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].endsWith("secure-access.plugin.ts")
)
if (isMain) {
  const results = runPluginTests()
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`\nSecureAccess Plugin Tests: ${passed} passed, ${failed} failed\n`)
  for (const r of results) {
    console.log(`  ${r.passed ? "✓" : "✗"} ${r.name}${r.error ? `\n      ${r.error}` : ""}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

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

const stripQuotedSegments = (cmd: string): string => cmd.replace(/(['"])(?:(?!\1|\\).|\\.)*\1/g, "")

// "2>&1" e "&>" duplicam descritor de saída, não encadeiam comandos
const stripFdDuplication = (cmd: string): string => cmd.replace(/&?\d?>&?\d?/g, "")

const hasChaining = (cmd: string): boolean => {
  const noQuotes = stripQuotedSegments(cmd)
  return /&&|\|\||;|\||&|`|\$\(|\$\{|\n|\r|%0A|%0D/.test(stripFdDuplication(noQuotes))
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

// --- Scope extraction (comandos de leitura e argumentos de path do git) ---

// "." e "" apontam para a pasta atual, que está dentro do escopo
export const isCurrentDirToken = (token: string): boolean => token === "." || token === ""

// Flags como "/F" não são paths, mas "/etc/passwd", "/" e UNC são caminhos absolutos
export const isPathLikeArg = (token: string): boolean => {
  const value = stripQuotes(token)
  if (classifyArg(value).type !== "flag") return true
  if (value === "/" || /^\\\\/.test(value)) return true
  return /^\//.test(value) && /[\\/]/.test(value.slice(1))
}

// Flags cujo valor seguinte é texto livre (mensagem de commit), não caminho
const freeTextValueFlags = new Set(["-m", "--message"])

export const collectPathArgs = (tokens: string[]): string[] => {
  const paths: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = stripQuotes(tokens[i])
    if (freeTextValueFlags.has(token)) {
      i++
      continue
    }
    if (isPathLikeArg(token)) paths.push(token)
  }
  return paths
}

// Comandos de leitura que devem respeitar o escopo da pasta atual
export const readCommandTypes = new Set(["cat", "type", "ls", "get-content", "get-childitem", "test-path"])

// --- Redirecionamento, payloads entre aspas e comandos bloqueados ---

// Metadados de redirecionamento: > >> < 2> 2>> &>
const redirectPattern = /(?:^|[\s|(&])(?:\d|&)?(>>?|<<?)\s*("[^"]*"|'[^']*'|\S+)/g

export const extractRedirectTargets = (cmd: string): string[] => {
  const targets: string[] = []
  for (const match of cmd.matchAll(redirectPattern)) {
    const target = stripQuotes(match[2])
    // "&1" é duplicação de descritor (ex.: 2>&1), não um caminho
    if (!target || target.startsWith("&")) continue
    targets.push(target)
  }
  return targets
}

// Caminho absoluto (Windows/UNC) ou travessia ".." escondida dentro de um payload entre aspas
const embeddedPathPattern = /[A-Za-z]:\\[^\s"'`]+|\\\\[^\s"'`]+|(?:^|[\s"'`=])\.\.[\\/][^\s"'`]*/g
const rootSlashPattern = /(^|[\s"'`])\/(?=[\s"'`]|$)/g

// Valores de flags de texto livre (mensagem de commit) não são caminhos
const freeTextValuePattern = /(?:^|\s)(?:-m|--message)(?:=|\s+)("[^"]*"|'[^']*'|\S+)/g

export const stripFreeTextValues = (cmd: string): string => cmd.replace(freeTextValuePattern, " ")

export const extractEmbeddedPaths = (cmd: string): string[] => {
  const paths: string[] = []
  const scannable = stripFreeTextValues(cmd)
  for (const match of scannable.matchAll(embeddedPathPattern)) {
    paths.push(match[0].replace(/^[\s"'`=]+/, ""))
  }
  for (const _ of scannable.matchAll(rootSlashPattern)) {
    paths.push("/")
  }
  return paths
}

// Download de payloads, execução remota e mutação do estado do sistema
export const blockedCommandTypes = new Set([
  "wget",
  "iwr",
  "irm",
  "iex",
  "invoke-webrequest",
  "invoke-restmethod",
  "invoke-expression",
  "invoke-command",
  "start-bitstransfer",
  "bitsadmin",
  "certutil",
  "mshta",
  "rundll32",
  "regsvr32",
  "scp",
  "reg",
  "net",
  "netsh",
  "sc",
  "taskkill",
  "stop-process",
  "start-process",
  "set-service",
  "restart-service",
  "new-service",
  "remove-service",
  "takeown",
  "icacls",
  "attrib",
  "cipher",
  "bcdedit",
  "diskpart",
  "format",
  "shutdown",
  "restart-computer",
  "stop-computer",
  "clear-eventlog",
  "wevtutil",
])

// Comandos que executam scripts/builds: os paths passados também respeitam o escopo.
// "pnpm-pw-check" fica de fora: a regra já permite exatamente um caminho irmão do monorepo.
export const scopedRunnerTypes = new Set([
  "npx-playwright",
  "vitest-run",
  "pnpm-run",
  "pnpm-exec",
])

// Tipos em que o scan de paths embutidos não se aplica:
// "echo" apenas imprime texto; "pnpm-pw-check" permite um caminho irmão do monorepo por regra
const embeddedScanExemptTypes = new Set(["echo", "pnpm-pw-check"])

// Interpretadores com código inline (-c/-e/--eval) são shell disfarçado: o conteúdo não é inspecionável
const inlineEvalTypes = new Set([
  "bash",
  "sh",
  "zsh",
  "pwsh",
  "powershell",
  "cmd",
  "python",
  "python3",
  "py",
  "ruby",
  "perl",
  "osascript",
  "wscript",
  "cscript",
  "node",
])

const inlineEvalFlags = new Set(["-c", "-e", "--eval", "/c", "/k", "-command", "-encodedcommand"])

// Normaliza o executável: remove aspas, diretório e extensão (.\wget.exe -> wget)
export const baseCommandName = (token: string): string => {
  const value = stripQuotes(token)
  const base = value.split(/[\\/]/).pop() ?? ""
  return base.replace(/\.(exe|cmd|bat|ps1|com)$/i, "").toLowerCase()
}

// npx/pnpx/bunx/dlx e `pnpm|npm exec` executam outro comando: o nome real está adiante
const launcherTypes = new Set(["npx", "pnpx", "bunx", "bun", "dlx", "yarn", "yarnpkg"])
const execWrapperSubcommands = new Set(["exec", "dlx"])

export const resolveCommandSlice = (tokens: string[]): string[] => {
  if (tokens.length === 0) return tokens
  const name = baseCommandName(tokens[0])
  if (launcherTypes.has(name)) return tokens.slice(1)
  if ((name === "pnpm" || name === "npm") && execWrapperSubcommands.has((tokens[1] ?? "").toLowerCase())) {
    return tokens.slice(2)
  }
  return tokens
}

export const hasInlineEval = (tokens: string[]): boolean => {
  const resolved = resolveCommandSlice(tokens)
  const commandType = resolved.length > 0 ? baseCommandName(resolved[0]) : ""
  if (!inlineEvalTypes.has(commandType)) return false
  return resolved.slice(1).some((t) => inlineEvalFlags.has(t.toLowerCase()))
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
  pull: () => false,
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
  // cp/mv do shell (git bash) usam a mesma validação de origem/destino
  { pattern: /^(cp|mv)\s+(.+)$/i, type: "copy-item" },
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

  const scopeError = (detail: string): Error =>
    new Error(
      `[secure-access] Não permitido: esta ação é restrita ao escopo da pasta atual: ${directory}\n${detail}`
    )

  // allowCurrentDir: "." representa a pasta atual (ex.: git add ., ls .)
  const assertInScope = (target: string, detail: string, allowCurrentDir = false): void => {
    if (!target) return
    if (allowCurrentDir && isCurrentDirToken(target)) return
    if (!isPathInsideProject(target)) throw scopeError(detail)
  }

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
            assertInScope(val, `Ferramenta: ${input.tool}\nCaminho: ${val}`, true)
          }
        }
      }

      if (input.tool !== "bash") return

      const command = (args.command as string ?? "").trim()
      if (!command) return
      const detail = `Comando: ${command}`

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
      const tokens = tokenize(normalized)

      // Comandos fora da allowlist: download, shells aninhadas e estado do sistema.
// Só vale quando nenhuma regra os autorizou (regras estreitas como "taskkill /IM node.exe" seguem válidas).
if (!parsed) {
        const resolved = resolveCommandSlice(tokens)
        const rawType = resolved.length > 0 ? baseCommandName(resolved[0]) : ""
        if (blockedCommandTypes.has(rawType)) {
          throw new Error(`[secure-access] Blocked command: ${rawType}\n${command}`)
        }

        if (hasInlineEval(tokens)) {
          throw new Error(`[secure-access] Blocked inline code execution: ${command}`)
        }
      }

      // Paths escondidos dentro de payloads entre aspas (ex.: powershell -c "Get-Content C:\...")
      if (!embeddedScanExemptTypes.has(parsed?.type ?? "")) {
        for (const p of extractEmbeddedPaths(normalized)) assertInScope(p, detail)
      }

      // Redirecionamento de saída escreve fora do escopo se o alvo estiver fora
      for (const target of extractRedirectTargets(normalized)) assertInScope(target, detail)

      if (!parsed) {
        for (const p of collectPathArgs(tokens)) assertInScope(p, detail)
        return
      }

      // --- Validators per type ---

      // stop-process is always allowed (only matches node/tsx)
      if (parsed.type === "stop-process") {
        return
      }

      // Leitura de arquivos e paths do git também respeitam o escopo da pasta atual
      if (readCommandTypes.has(parsed.type) || parsed.type === "git") {
        for (const p of collectPathArgs(tokens)) assertInScope(p, detail, true)
      }

      // npx/vitest/pnpm run|exec: paths passados ao script também respeitam o escopo
      if (scopedRunnerTypes.has(parsed.type)) {
        for (const p of collectPathArgs(tokens)) assertInScope(p, detail, true)
      }

      // Fase 27: node/tsx – validate script path, extension, and existence
      if (parsed.type === "exec") {
        const scriptArg = parsed.args[1]
        const resolveScript = (base?: string) => {
          const root = typeof base === "string" && base.length > 0 ? base : directory
          const fullPath = resolve(directory, root, scriptArg)
          if (existsSync(fullPath)) return safeRealPath(fullPath)
          return null
        }
        const workdir = typeof args.workdir === "string" ? args.workdir : undefined
        const real = resolveScript(directory) ?? resolveScript(workdir)
        if (!real) {
          // File not found via directory or workdir; validate the path is within project boundary
          assertInScope(resolve(directory, scriptArg), detail)
          if (/\.(exe|com|bat|ps1|sh|dll)$/i.test(scriptArg)) {
            throw new Error(
              `[secure-access] Blocked ${parsed.args[0]} with dangerous extension:\n${scriptArg}`
            )
          }
        } else {
          assertInScope(real, detail)
          if (!/\.(ts|js|tsx|mjs|cjs)$/i.test(real)) {
            throw new Error(
              `[secure-access] Blocked ${parsed.args[0]} with invalid extension:\n${real}`
            )
          }
        }
      }

      if (parsed.type === "cd") {
        assertInScope(parsed.args[0], detail)
      }

      if (parsed.type === "rm") {
        const target = parsed.args[1] ?? parsed.args[0]
        if (target && target !== "node_modules") assertInScope(target, detail)
      }

      if (parsed.type === "del") {
        assertInScope(parsed.args[1] ?? parsed.args[0], detail)
      }

      if (parsed.type === "remove-item") {
        for (const p of collectPathArgs(tokenize(parsed.args[0]))) assertInScope(p, detail)
      }

      if (parsed.type === "mkdir") {
        assertInScope(parsed.args[1] ?? parsed.args[0], detail)
      }

      // Fase 26: Copy-Item / Move-Item – source and destination
      if (parsed.type === "copy-item" || parsed.type === "move-item") {
        const paths = collectPathArgs(tokenize(parsed.args[0]))
        for (const p of paths.slice(0, 2)) assertInScope(p, detail)
      }

      // Fase 25 + 42: Set-Content / New-Item – only first path-classified arg is target
      if (parsed.type === "set-content" || parsed.type === "new-item") {
        const target = collectPathArgs(tokenize(parsed.args[0]))[0]
        assertInScope(target, detail)
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

  // --- Scope extraction (read commands + git path args) ---

  test("treats the current folder marker as in scope", () => {
    if (!isCurrentDirToken(".")) throw new Error("'.' should be the current folder")
    if (isCurrentDirToken("..")) throw new Error("'..' must not be the current folder")
  })

  test("collectPathArgs keeps relative paths", () => {
    const r = collectPathArgs(tokenize("cat src/file.ts"))
    if (!r.includes("src/file.ts")) throw new Error("should collect relative path")
  })

  test("collectPathArgs treats slash absolute paths as paths", () => {
    const r = collectPathArgs(["cat", "/etc/passwd"])
    if (!r.includes("/etc/passwd")) throw new Error("should collect /etc/passwd")
  })

  test("collectPathArgs ignores single-segment slash flags", () => {
    const r = collectPathArgs(["taskkill", "/F", "/IM", "node.exe"])
    if (r.includes("/F") || r.includes("/IM")) throw new Error("slash flags are not paths")
    if (!r.includes("node.exe")) throw new Error("should keep node.exe")
  })

  test("collectPathArgs keeps glob patterns", () => {
    const r = collectPathArgs(tokenize("rm -rf src/**/*.ts"))
    if (!r.includes("src/**/*.ts")) throw new Error("should keep pattern")
  })

  test("collectPathArgs skips the commit message value", () => {
    const r = collectPathArgs(tokenize("git commit -m 'handle C:\\Windows paths'"))
    if (r.includes("handle C:\\Windows paths")) throw new Error("commit message must not be a path")
  })

  test("read command types are scope validated", () => {
    for (const t of ["cat", "type", "ls", "get-content", "get-childitem", "test-path"]) {
      if (!readCommandTypes.has(t)) throw new Error(`${t} should be scope validated`)
    }
  })

  test("collectPathArgs finds out-of-scope read targets", () => {
    const r = collectPathArgs(tokenize("cat C:\\Windows\\System32\\drivers\\etc\\hosts"))
    if (!r.some(p => !validator(p))) throw new Error("system path should be out of scope")
  })

  test("collectPathArgs finds out-of-scope git targets", () => {
    const r = collectPathArgs(tokenize("git add ../../outside/file.ts"))
    if (!r.some(p => !validator(p))) throw new Error("git path outside scope should be detected")
  })

  test("collectPathArgs keeps current folder and project refs", () => {
    const a = collectPathArgs(tokenize("ls ."))
    if (!a.includes(".")) throw new Error("should keep '.'")
    const b = collectPathArgs(tokenize("git checkout main"))
    if (b.some(p => !validator(p))) throw new Error("branch names must stay in scope")
  })

  // --- Redirect / quoted payloads / blocked commands ---

  test("extracts redirect targets", () => {
    if (!extractRedirectTargets("echo hi > out.txt").includes("out.txt")) throw new Error("should find >")
    if (!extractRedirectTargets("cmd 2> err.log").includes("err.log")) throw new Error("should find 2>")
    if (extractRedirectTargets("npm run build 2>&1").length !== 0) throw new Error("2>&1 is not a path")
  })

  test("redirect targets respect the project scope", () => {
    const r = extractRedirectTargets("echo hi > C:\\outside.txt")
    if (!r.some(p => !validator(p))) throw new Error("outside redirect should be detected")
  })

  test("finds paths hidden in quoted payloads", () => {
    const r = extractEmbeddedPaths('powershell -c "Get-Content C:\\Windows\\win.ini"')
    if (!r.includes("C:\\Windows\\win.ini")) throw new Error("should find absolute path")
    if (!extractEmbeddedPaths('bash -c "rm -rf /"').includes("/")) throw new Error("should find root slash")
    if (extractEmbeddedPaths("npx playwright test tests/e2e/login.spec.ts").length !== 0) {
      throw new Error("relative paths are not embedded findings")
    }
  })

  test("commit message is not scanned as a path", () => {
    const r = extractEmbeddedPaths("git commit -m 'fix: handle C:\\Windows paths'")
    if (r.length !== 0) throw new Error("free text value must be ignored")
  })

  test("blocks payload downloaders and system mutation", () => {
    for (const t of ["wget", "certutil", "invoke-webrequest", "reg", "net", "taskkill", "stop-process"]) {
      if (!blockedCommandTypes.has(t)) throw new Error(`${t} should be blocked`)
    }
    for (const t of ["curl", "git", "echo", "npm"]) {
      if (blockedCommandTypes.has(t)) throw new Error(`${t} must stay usable`)
    }
  })

  test("flags inline code in interpreters", () => {
    if (!hasInlineEval(tokenize('bash -c "rm -rf /"'))) throw new Error("bash -c should be flagged")
    if (!hasInlineEval(tokenize('python -c "import os"'))) throw new Error("python -c should be flagged")
    if (hasInlineEval(tokenize("python scripts/x.py"))) throw new Error("script files are fine")
  })

  test("normalizes the executable name", () => {
    if (baseCommandName(".\\wget.exe") !== "wget") throw new Error("path + extension should normalize")
    if (baseCommandName('"C:\\tools\\python.exe"') !== "python") throw new Error("quoted path should normalize")
    if (baseCommandName("TaskKill") !== "taskkill") throw new Error("case should normalize")
  })

  test("sees through launcher prefixes", () => {
    if (!hasInlineEval(tokenize('npx python -c "import os"'))) throw new Error("npx prefix should not hide -c")
    if (!hasInlineEval(tokenize('pnpm exec python -c "import os"'))) throw new Error("pnpm exec should not hide -c")
    if (hasInlineEval(tokenize("npx tsc --noEmit"))) throw new Error("normal npx usage is fine")
    const resolved = resolveCommandSlice(tokenize("pnpm exec python -c x"))
    if (baseCommandName(resolved[0]) !== "python") throw new Error("should resolve through pnpm exec")
  })

  test("detects single ampersand chaining but not fd duplication", () => {
    if (!hasChaining("echo a & echo b")) throw new Error("should detect &")
    if (hasChaining("npm run build 2>&1")) throw new Error("2>&1 is not chaining")
    if (hasChaining("npm run build &> out.txt")) throw new Error("&> is not chaining")
  })

  test("cp/mv are parsed as copy-item", () => {
    if (!parseCommand("cp src/a.txt src/b.txt")) throw new Error("cp should parse")
    if (parseCommand("cp src/a.txt src/b.txt")?.type !== "copy-item") throw new Error("cp should be copy-item")
  })

  test("script runners validate their paths", () => {
    for (const t of ["npx-playwright", "vitest-run", "pnpm-run", "pnpm-exec"]) {
      if (!scopedRunnerTypes.has(t)) throw new Error(`${t} should validate paths`)
    }
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

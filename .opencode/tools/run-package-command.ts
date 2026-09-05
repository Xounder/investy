import { tool } from "@opencode-ai/plugin"
import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

export default tool({
  description: "Run a pnpm command in a workspace package",
  args: {
    command: tool.schema.enum(["build", "lint", "typecheck", "test"]).describe("Command to run"),
    package: tool.schema.string().optional().describe("Package directory relative to worktree (e.g. apps/web)"),
  },
  async execute({ command, package: pkg }, ctx) {
    const dir = pkg ? join(ctx.worktree, pkg) : ctx.worktree
    if (!existsSync(join(dir, "package.json"))) {
      return `Error: No package.json found at ${dir}`
    }
    try {
      const opts: any = { cwd: dir, encoding: "utf-8", stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
      const stdout = execSync(`pnpm ${command}`, opts)
      return stdout || "(no output)"
    } catch (e: any) {
      const stderr = (e.stderr || "").toString().trim()
      const stdout = (e.stdout || "").toString().trim()
      const details = [stderr, stdout].filter(Boolean).join("\n--- stdout ---\n")
      return `Error (exit ${e.status ?? "?"}): ${details || e.message}`
    }
  },
})

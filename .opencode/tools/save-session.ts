import { tool } from "@opencode-ai/plugin"
import { writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from "fs"
import { join } from "path"

export default tool({
  description: "Save session evaluation with 2-file retention policy",
  args: {
    evaluation: tool.schema.string().describe("Session evaluation text (DONE, WRONG, IMPROV, LEARN, NEXT)"),
    description: tool.schema.string().default("session").describe("Short description for filename (e.g., doc-audit, pipeline-mvp)"),
  },
  async execute({ evaluation, description }, context) {
    const sessionDir = join(context.worktree, ".opencode/sessions")
    mkdirSync(sessionDir, { recursive: true })

    const now = new Date()
    const dateStr = now.toLocaleDateString("en-CA").replace(/-/g, "")
    const hours = now.getHours().toString().padStart(2, "0")
    const minutes = now.getMinutes().toString().padStart(2, "0")
    const filename = `${dateStr}-${hours}-${minutes}-${description}-session.tmp`
    const filepath = join(sessionDir, filename)

    writeFileSync(filepath, evaluation, "utf-8")

    const files = readdirSync(sessionDir)
      .filter((f) => f.endsWith("-session.tmp"))
      .map((f) => ({ name: f, time: statSync(join(sessionDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)

    let deleted = 0
    for (const f of files.slice(2)) {
      rmSync(join(sessionDir, f.name))
      deleted++
    }

    return `Created: ${filename}, kept ${Math.min(2, files.length)} file(s), deleted ${deleted} old file(s)`
  },
})
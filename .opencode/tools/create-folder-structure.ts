import { tool } from "@opencode-ai/plugin"
import { mkdirSync } from "fs"
import { join } from "path"

export default tool({
  description: "Create folder structure for a pipeline execution context",
  args: {
    context: tool.schema.string().describe("Pipeline context name (e.g., 'documentation-analysis')"),
  },
  async execute({ context }, ctx) {
    const base = join(ctx.worktree, ".opencode/plan", context)
    const folders = ["design-docs", "planning", "tasks"]
    mkdirSync(base, { recursive: true })
    for (const f of folders) {
      mkdirSync(join(base, f), { recursive: true })
    }
    return `Created: ${base}/{${folders.join(",")}}`
  },
})

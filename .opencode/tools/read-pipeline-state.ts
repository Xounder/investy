import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"

export default tool({
  description: "Read fields from pipeline.yaml",
  args: {
    fields: tool.schema.array(tool.schema.string()).optional().describe("Dot-separated field paths (empty = all fields)"),
  },
  async execute({ fields }, ctx) {
    const raw = readFileSync(join(ctx.worktree, ".opencode/pipeline.yaml"), "utf-8")
    const data = parse(raw)
    if (!fields || fields.length === 0) return JSON.stringify(data, null, 2)
    const result: Record<string, unknown> = {}
    for (const f of fields) {
      const val = f.split(".").reduce((acc: any, key) => acc?.[key], data)
      if (val !== undefined) result[f] = val
    }
    return JSON.stringify(result, null, 2)
  },
})

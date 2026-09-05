import { tool } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { parse } from "yaml"

interface VarEntry {
  key: string
  raw: string
}

function parseVariables(raw: string): VarEntry[] {
  const entries: VarEntry[] = []
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const m = trimmed.match(/^\[(\w+)\]\s*=\s*(.+)$/)
    if (m) entries.push({ key: m[1], raw: m[2].trim() })
  }
  return entries
}

export default tool({
  description: "Render a template by resolving [VARIABLES] from variables.md",
  args: {
    template: tool.schema.string().describe("Template file path relative to worktree (e.g. .opencode/template/design-template.md)"),
    context: tool.schema.string().optional().describe("Pipeline context name (reads from pipeline.yaml if omitted)"),
  },
  async execute({ template, context }, ctx) {
    const varFile = join(ctx.worktree, ".opencode/template/variables.md")
    if (!existsSync(varFile)) return "Error: variables.md not found"

    const varRaw = readFileSync(varFile, "utf-8")
    const entries = parseVariables(varRaw)

    if (!context) {
      const pipeFile = join(ctx.worktree, ".opencode/pipeline.yaml")
      if (existsSync(pipeFile)) {
        const pipeRaw = readFileSync(pipeFile, "utf-8")
        try {
          const pipeData = parse(pipeRaw)
          context = pipeData?.pipeline?.name
        } catch {}
      }
    }

    const resolved: Record<string, string> = {}
    for (const e of entries) {
      resolved[e.key] = e.raw.replace("<context>", context ?? "<context>")
    }

    let changed = true
    while (changed) {
      changed = false
      for (const e of entries) {
        const before = resolved[e.key]
        resolved[e.key] = resolved[e.key].replace(/\[(\w+)\]/g, (_, k) => resolved[k] ?? `[${k}]`)
        if (resolved[e.key] !== before) changed = true
      }
    }

    const tplFile = join(ctx.worktree, template)
    if (!existsSync(tplFile)) return `Error: template not found at ${tplFile}`
    let content = readFileSync(tplFile, "utf-8")
    content = content.replace(/\[(\w+)\]/g, (_, k) => resolved[k] ?? `[${k}]`)

    return content
  },
})

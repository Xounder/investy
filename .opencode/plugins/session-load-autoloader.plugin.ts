import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

export const SessionLoadAutoLoaderPlugin: Plugin = async ({ directory }) => {
  let sessionContent: string | null = null

  try {
    const sessionsDir = join(directory, ".opencode", "sessions")
    const allFiles = readdirSync(sessionsDir)
    const tmpFiles = allFiles
      .filter(f => f.endsWith(".tmp"))
      .map(f => ({
        path: join(sessionsDir, f),
        mtime: statSync(join(sessionsDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime)

    if (tmpFiles.length > 0) {
      sessionContent = readFileSync(tmpFiles[0].path, "utf-8")
    }
  } catch {
    // Silently fail
  }

  let injected = false

  return {
    "chat.message": async (_input, output) => {
      if (sessionContent && !injected) {
        injected = true
        for (const part of output.parts) {
          if (part.type === "text") {
            (part as any).text = `[Previous Session Context]\n${sessionContent}\n\n${(part as any).text}`
            break
          }
        }
      }
    }
  }
}

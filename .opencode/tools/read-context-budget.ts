import { tool } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { snapshotContextBudget, unknown } from "../lib/context-budget"

// Bounds asynchronous SDK work, including awaited response parsing; not synchronous JSON.parse time or bytes.
const requestTimeoutMs = 5_000
const recentMessageLimit = 20

export default tool({
  description: "Read the latest completed assistant input-context snapshot for the caller's OpenCode session. Unknown readings conservatively stop new work; not a hard limit.",
  args: {
    serverUrl: tool.schema.string().url().optional().describe("OpenCode server URL if not on the SDK server's default http://localhost:4096 (loopback only)"),
  },
  async execute({ serverUrl }, ctx) {
    const address = serverUrl ?? "http://localhost:4096"
    const invokedAt = Date.now()
    const controller = new AbortController()
    const abort = () => controller.abort()
    ctx.abort.addEventListener("abort", abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const url = new URL(address)
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
          !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
          url.pathname !== "/" || url.search || url.hash) {
        return JSON.stringify(unknown(ctx.sessionID, "Only an uncredentialed loopback OpenCode server URL is allowed"))
      }
      if (ctx.abort.aborted) return JSON.stringify(unknown(ctx.sessionID, "Tool invocation aborted"))
      const client = createOpencodeClient({ baseUrl: address, directory: ctx.directory })
      const response = client.session.messages({
        path: { id: ctx.sessionID }, query: { directory: ctx.directory, limit: recentMessageLimit }, signal: controller.signal,
      })
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(null) }, requestTimeoutMs)
      })
      const result = await Promise.race([response, timeout])
      if (result === null) return JSON.stringify(unknown(ctx.sessionID, "Session messages request timed out after 5000 ms"))
      if (ctx.abort.aborted) return JSON.stringify(unknown(ctx.sessionID, "Tool invocation aborted"))
      if (result.error || !result.data) {
        return JSON.stringify(unknown(ctx.sessionID, "Session messages unavailable (SDK error or empty response)"))
      }
      return JSON.stringify(snapshotContextBudget(ctx.sessionID, result.data, invokedAt))
    } catch {
      return JSON.stringify(unknown(ctx.sessionID, "OpenCode server unavailable or invalid response"))
    } finally {
      if (timer) clearTimeout(timer)
      ctx.abort.removeEventListener("abort", abort)
    }
  },
})

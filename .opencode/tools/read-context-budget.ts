import { tool } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { loadContextBudgetConfig, snapshotContextBudget, unknown } from "../lib/context-budget"
import { contextBudgetClient } from "../lib/context-budget-client"

// Bounds asynchronous SDK work, including awaited response parsing; not synchronous JSON.parse time or bytes.
const requestTimeoutMs = 5_000
const recentMessageLimit = 20

export default tool({
  description: "Read the latest completed assistant input-context snapshot for the caller's OpenCode session. Unknown readings conservatively stop new work; not a hard limit.",
  args: {
    serverUrl: tool.schema.string().url().optional().describe("Optional uncredentialed loopback OpenCode server URL override; normally uses the host-injected SDK client"),
  },
  async execute({ serverUrl }, ctx) {
    const limits = loadContextBudgetConfig()
    if (!limits) return JSON.stringify(unknown(ctx.sessionID, "Context budget configuration unavailable or invalid", null))
    const invokedAt = Date.now()
    const controller = new AbortController()
    const abort = () => controller.abort()
    ctx.abort.addEventListener("abort", abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    try {
      if (serverUrl) {
        const url = new URL(serverUrl)
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
            !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
            url.pathname !== "/" || url.search || url.hash) {
          return JSON.stringify(unknown(ctx.sessionID, "Only an uncredentialed loopback OpenCode server URL is allowed", limits))
        }
      }
      if (ctx.abort.aborted) return JSON.stringify(unknown(ctx.sessionID, "Tool invocation aborted", limits))
      // Preserve standalone/legacy behavior when a plugin has not initialized yet.
      // A refused localhost:4096 request is unknown, never a fabricated measurement.
      const client = serverUrl
        ? createOpencodeClient({ baseUrl: serverUrl, directory: ctx.directory })
        : contextBudgetClient(ctx.directory, ctx.worktree) ??
          createOpencodeClient({ baseUrl: "http://localhost:4096", directory: ctx.directory })
      const response = client.session.messages({
        path: { id: ctx.sessionID }, query: { directory: ctx.directory, limit: recentMessageLimit }, signal: controller.signal,
      })
      const timeout = new Promise<"timeout" | "aborted">((resolve) => {
        onAbort = () => resolve("aborted")
        ctx.abort.addEventListener("abort", onAbort, { once: true })
        timer = setTimeout(() => { controller.abort(); resolve("timeout") }, requestTimeoutMs)
      })
      const result = await Promise.race([response, timeout])
      if (result === "timeout") return JSON.stringify(unknown(ctx.sessionID, "Session messages request timed out after 5000 ms", limits))
      if (result === "aborted") return JSON.stringify(unknown(ctx.sessionID, "Tool invocation aborted", limits))
      if (ctx.abort.aborted) return JSON.stringify(unknown(ctx.sessionID, "Tool invocation aborted", limits))
      if (result.error || !result.data) {
        const status = result.response?.status
        const reason = !result.error ? "Session messages response is empty"
          : status === 401 || status === 403 ? "Session messages access denied (HTTP 401/403)"
          : status === 404 ? "Session not found in caller's directory (HTTP 404)"
          : "Session messages request failed (check session access and server availability)"
        return JSON.stringify(unknown(ctx.sessionID, reason, limits))
      }
      return JSON.stringify(snapshotContextBudget(ctx.sessionID, result.data, invokedAt, limits))
    } catch {
      const fallback = !serverUrl && !contextBudgetClient(ctx.directory, ctx.worktree)
      return JSON.stringify(unknown(ctx.sessionID, fallback
        ? "OpenCode session request unavailable (host client not registered; localhost:4096 fallback failed)"
        : "OpenCode session request unavailable or invalid response", limits))
    } finally {
      if (timer) clearTimeout(timer)
      if (onAbort) ctx.abort.removeEventListener("abort", onAbort)
      ctx.abort.removeEventListener("abort", abort)
    }
  },
})

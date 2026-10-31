import { tool } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk"
import type { SessionMessagesResponse } from "@opencode-ai/sdk"
import { currentModel, effectiveLimits, loadContextBudgetConfig, resolveCapacity, snapshotContextBudget, unknown } from "../lib/context-budget"
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
    const config = loadContextBudgetConfig()
    if (!config) return JSON.stringify(unknown(ctx.sessionID, "Context budget configuration unavailable or invalid"))
    const controller = new AbortController()
    const abort = () => controller.abort()
    ctx.abort.addEventListener("abort", abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    let timedOut = false
    let confirmed: { messages: SessionMessagesResponse; model: { providerID: string; modelID: string } } | null = null
    const manualSnapshot = (reason: string) => {
      if (!confirmed) return unknown(ctx.sessionID, "Session messages request timed out or current model unavailable")
      const capacity = resolveCapacity(config, confirmed.model, null)
      if (!capacity) return unknown(ctx.sessionID, `${reason}; no exact-model manual override`)
      const limits = effectiveLimits(config, capacity)
      return limits ? snapshotContextBudget(ctx.sessionID, confirmed.messages, Date.now(), limits, capacity)
        : unknown(ctx.sessionID, "Effective model budget limits invalid or too small")
    }
    try {
      if (serverUrl) {
        const url = new URL(serverUrl)
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
            !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
            url.pathname !== "/" || url.search || url.hash) {
          return JSON.stringify(unknown(ctx.sessionID, "Only an uncredentialed loopback OpenCode server URL is allowed"))
        }
      }
      if (ctx.abort.aborted) return JSON.stringify(unknown(ctx.sessionID, "Tool invocation aborted"))
      // Preserve standalone/legacy behavior when a plugin has not initialized yet.
      // A refused localhost:4096 request is unknown, never a fabricated measurement.
      const client = serverUrl
        ? createOpencodeClient({ baseUrl: serverUrl, directory: ctx.directory })
        : contextBudgetClient(ctx.directory, ctx.worktree) ??
          createOpencodeClient({ baseUrl: "http://localhost:4096", directory: ctx.directory })
      const response = (async () => {
        const messages = await client.session.messages({
          path: { id: ctx.sessionID }, query: { directory: ctx.directory, limit: recentMessageLimit }, signal: controller.signal,
        })
        if (messages.error || !messages.data) {
          const status = messages.response?.status
          return unknown(ctx.sessionID, !messages.error ? "Session messages response is empty"
            : status === 401 || status === 403 ? "Session messages access denied (HTTP 401/403)"
            : status === 404 ? "Session not found in caller's directory (HTTP 404)"
            : "Session messages request failed (check session access and server availability)")
        }
        const model = currentModel(ctx.sessionID, messages.data)
        if (!model) return unknown(ctx.sessionID, "Current caller model selection unavailable")
        if (ctx.abort.aborted || controller.signal.aborted) return unknown(ctx.sessionID, "Tool invocation aborted or deadline exceeded")
        confirmed = { messages: messages.data, model }
        let entry: unknown = null
        try {
          const providers = await client.config.providers({ query: { directory: ctx.directory }, signal: controller.signal })
          entry = providers.error ? null : providers.data?.providers?.find((provider) => provider.id === model.providerID)?.models?.[model.modelID]
        } catch {
          // Only confirmed caller-session messages can authorize an exact-model manual fallback.
        }
        if (ctx.abort.aborted || controller.signal.aborted) return unknown(ctx.sessionID, "Tool invocation aborted or deadline exceeded")
        // Never return raw provider configuration, response bodies, keys or SDK error text.
        const capacity = resolveCapacity(config, model, entry)
        if (!capacity) return unknown(ctx.sessionID, "Current model capacity unavailable; configure an exact-model manual override or stop new work")
        const limits = effectiveLimits(config, capacity)
        if (!limits) return unknown(ctx.sessionID, "Effective model budget limits invalid or too small")
        return snapshotContextBudget(ctx.sessionID, messages.data, Date.now(), limits, capacity)
      })()
      const timeout = new Promise<"timeout" | "aborted">((resolve) => {
        onAbort = () => resolve("aborted")
        ctx.abort.addEventListener("abort", onAbort, { once: true })
        timer = setTimeout(() => { timedOut = true; controller.abort(); resolve("timeout") }, requestTimeoutMs)
      })
      const result = await Promise.race([response, timeout])
      if (result === "aborted" || ctx.abort.aborted) return JSON.stringify(unknown(ctx.sessionID, "Tool invocation aborted"))
      if (timedOut || result === "timeout") return JSON.stringify(confirmed ? manualSnapshot("Configured model metadata request timed out after 5000 ms") : unknown(ctx.sessionID, "Context budget SDK request timed out after 5000 ms"))
      return JSON.stringify(result)
    } catch {
      if (ctx.abort.aborted) return JSON.stringify(unknown(ctx.sessionID, "Tool invocation aborted"))
      const fallback = !serverUrl && !contextBudgetClient(ctx.directory, ctx.worktree)
      return JSON.stringify(unknown(ctx.sessionID, fallback
        ? "OpenCode session request unavailable (host client not registered; localhost:4096 fallback failed)"
        : "OpenCode context budget request unavailable or invalid response"))
    } finally {
      if (timer) clearTimeout(timer)
      if (onAbort) ctx.abort.removeEventListener("abort", onAbort)
      ctx.abort.removeEventListener("abort", abort)
    }
  },
})

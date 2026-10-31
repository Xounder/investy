import { describe, expect, it, vi } from "vitest"
import type { SessionMessagesResponse } from "@opencode-ai/sdk"

const { messages, createClient } = vi.hoisted(() => {
  const messages = vi.fn()
  return { messages, createClient: vi.fn(() => ({ session: { messages } })) }
})
vi.mock("@opencode-ai/sdk", () => ({ createOpencodeClient: createClient }))

import budgetTool from "../tools/read-context-budget"
import { parseContextBudgetConfig, snapshotContextBudget } from "../lib/context-budget"

const sessionID = "principal"
// Preserve historical boundary scenarios using an explicit, non-default policy fixture.
const previousLimits = parseContextBudgetConfig({ target: 140_000, stopNewWork: 160_000, closeBy: 180_000, absoluteContextReference: 200_000, dispatchReserve: 20_000 })
function assistant(id: string, completed: number, input: number, read = 0, write = 0, session = sessionID) {
  return {
    info: {
      role: "assistant", id, sessionID: session, time: { created: completed - 100, completed },
      providerID: "provider", modelID: "model", tokens: { input, output: 999_999, reasoning: 9, cache: { read, write } },
    }, parts: [],
  }
}
function entries(...items: ReturnType<typeof assistant>[]): SessionMessagesResponse {
  return items as SessionMessagesResponse
}

describe("context budget snapshot", () => {
  it("takes the latest completed assistant in the principal session, not sums or subagents", () => {
    const data = entries(
      assistant("older", 1000, 150_000), assistant("latest", 3000, 70_000, 50_000, 1_000),
      assistant("child", 4000, 199_000, 0, 0, "child-session"),
      { ...assistant("inflight", 5000, 190_000), info: { ...assistant("inflight", 5000, 190_000).info, time: { created: 5000 } } } as ReturnType<typeof assistant>,
    )
    const result = snapshotContextBudget(sessionID, data, 3000, previousLimits)
    expect(result).toMatchObject({
      status: "measured", policy: "continue", messageID: "latest", sessionID,
      inputContextTokens: 121_000, uncachedInputTokens: 70_000,
      cacheReadTokens: 50_000, cacheWriteTokens: 1_000,
      observedAt: "1970-01-01T00:00:03.000Z", model: { providerID: "provider", modelID: "model" },
      headroomToStopNewWork: 39_000,
    })
  })

  it.each([
    [139_999, "continue"], [140_000, "continue"], [160_000, "stop-new-work"],
    [180_000, "close-now"], [200_000, "close-now"],
  ] as const)("uses historical explicitly configured guidance bands at %i", (input, policy) => {
    expect(snapshotContextBudget(sessionID, entries(assistant("one", 1000, input)), 1000, previousLimits).policy).toBe(policy)
  })

  it("does not borrow older measurements when the newest completed counters are invalid", () => {
    const bad = assistant("bad", 2000, -1)
    expect(snapshotContextBudget(sessionID, entries(assistant("good", 1000, 10), bad), 2000)).toMatchObject({
      status: "unknown", policy: "unknown-stop-new-work", inputContextTokens: null,
    })
  })

  it("falls back conservatively for empty, foreign-session, or overflowed readings", () => {
    expect(snapshotContextBudget(sessionID, [])).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work" })
    expect(snapshotContextBudget(sessionID, entries(assistant("foreign", 1000, 10, 0, 0, "other")), 1000).messageID).toBeNull()
    expect(snapshotContextBudget(sessionID, entries(assistant("overflow", 1000, Number.MAX_SAFE_INTEGER, 1)), 1000).inputContextTokens).toBeNull()
    expect(snapshotContextBudget(sessionID, entries(assistant("bad-time", 9e15, 100)), 9e15).status).toBe("unknown")
  })

  it("does not call failed or zero-token assistant messages measured snapshots", () => {
    const failed = assistant("failed", 2000, 100)
    const data = entries(assistant("older", 1000, 500), {
      ...failed, info: { ...failed.info, error: { name: "MessageAbortedError", data: { message: "aborted" } }, tokens: failed.info.tokens },
    } as ReturnType<typeof assistant>)
    expect(snapshotContextBudget(sessionID, data, 2000)).toMatchObject({ status: "unknown", inputContextTokens: null })
    expect(snapshotContextBudget(sessionID, entries(assistant("zero", 2000, 0)), 2000)).toMatchObject({
      status: "unknown", policy: "unknown-stop-new-work", inputContextTokens: null,
    })
  })

  it("accepts age 120 seconds exactly, rejects older and future observations", () => {
    const data = entries(assistant("one", 1000, 100))
    expect(snapshotContextBudget(sessionID, data, 121_000).status).toBe("measured")
    expect(snapshotContextBudget(sessionID, data, 121_001)).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work" })
    expect(snapshotContextBudget(sessionID, data, 999).status).toBe("unknown")
  })
})

describe("custom tool SDK contract", () => {
  const ctx = { sessionID, directory: "C:/workspace", worktree: "C:/workspace", abort: new AbortController().signal }

  it("passes context session and directory to SDK session.messages", async () => {
    messages.mockResolvedValueOnce({ data: entries(assistant("one", Date.now(), 100)), error: undefined })
    const result = JSON.parse(await budgetTool.execute({}, ctx as Parameters<typeof budgetTool.execute>[1]) as string)
    expect(createClient).toHaveBeenCalledWith({ baseUrl: "http://localhost:4096", directory: ctx.directory })
    expect(messages).toHaveBeenCalledWith({ path: { id: sessionID }, query: { directory: ctx.directory, limit: 20 }, signal: expect.any(AbortSignal) })
    expect(result).toMatchObject({ status: "measured", inputContextTokens: 100 })
  })

  it("returns unknown on SDK errors, exceptions, or non-loopback URL", async () => {
    messages.mockResolvedValueOnce({ data: undefined, error: { name: "NotFoundError" } })
    expect(JSON.parse(await budgetTool.execute({}, ctx as Parameters<typeof budgetTool.execute>[1]) as string).status).toBe("unknown")
    messages.mockRejectedValueOnce(new Error("offline"))
    expect(JSON.parse(await budgetTool.execute({}, ctx as Parameters<typeof budgetTool.execute>[1]) as string).policy).toBe("unknown-stop-new-work")
    const calls = createClient.mock.calls.length
    expect(JSON.parse(await budgetTool.execute({ serverUrl: "https://example.com" }, ctx as Parameters<typeof budgetTool.execute>[1]) as string).status).toBe("unknown")
    expect(createClient).toHaveBeenCalledTimes(calls)
  })

  it("accepts a caller-supplied loopback server address without changing session scope", async () => {
    messages.mockResolvedValueOnce({ data: entries(assistant("recent", Date.now(), 100)), error: undefined })
    const result = JSON.parse(await budgetTool.execute(
      { serverUrl: "http://127.0.0.1:5000" }, ctx as Parameters<typeof budgetTool.execute>[1],
    ) as string)
    expect(createClient).toHaveBeenCalledWith({ baseUrl: "http://127.0.0.1:5000", directory: ctx.directory })
    expect(result).toMatchObject({ status: "measured", sessionID, messageID: "recent" })
  })

  it("returns unknown when the bounded recent response has no completed assistant", async () => {
    messages.mockResolvedValueOnce({ data: entries(assistant("foreign", Date.now(), 1, 0, 0, "other")), error: undefined })
    const result = JSON.parse(await budgetTool.execute({}, ctx as Parameters<typeof budgetTool.execute>[1]) as string)
    expect(result).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work" })
    expect(messages).toHaveBeenLastCalledWith({
      path: { id: sessionID }, query: { directory: ctx.directory, limit: 20 }, signal: expect.any(AbortSignal),
    })
  })

  it("returns unknown promptly and aborts an unresponsive SDK request", async () => {
    vi.useFakeTimers()
    try {
      messages.mockImplementationOnce(() => new Promise(() => {}))
      const pending = budgetTool.execute({}, ctx as Parameters<typeof budgetTool.execute>[1])
      await vi.advanceTimersByTimeAsync(5_000)
      const result = JSON.parse(await pending as string)
      expect(result).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work" })
      expect(result.reason).toMatch(/timed out/)
      const options = messages.mock.lastCall?.[0] as { signal: AbortSignal }
      expect(options.signal.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

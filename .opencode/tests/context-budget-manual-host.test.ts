import { afterEach, describe, expect, it, vi } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk"
import budgetTool from "../tools/read-context-budget"
import { ContextBudgetPlugin } from "../plugins/context-budget.plugin"

// Keep this override fixture isolated from the default-config host tests.
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>()
  return { ...original, readFileSync: (path: string | URL, ...args: unknown[]) =>
    String(path).endsWith("/context-budget.json")
      ? JSON.stringify({ mode: "auto", ratios: { target: .7, stopNewWork: .8, closeBy: .9, dispatchReserve: .1 },
        caps: { target: 450000, stopNewWork: 580000, closeBy: 600000, dispatchReserve: 20000 },
        modelOverrides: { "openrouter/anthropic/claude": 200000 } })
      : (original.readFileSync as (...values: unknown[]) => unknown)(path, ...args),
  }
})

const directory = "C:/workspace"
const provider = "openrouter"
const modelID = "anthropic/claude"
const sessionID = "principal"
const ctx = (signal = new AbortController().signal) => ({ sessionID, directory, worktree: directory, abort: signal }) as Parameters<typeof budgetTool.execute>[1]
const messages = (model = modelID) => Response.json([
  { info: { role: "user", id: "user", sessionID, time: { created: Date.now() - 1100 }, model: { providerID: provider, modelID: model } }, parts: [] },
  { info: { role: "assistant", id: "assistant", sessionID, time: { created: Date.now() - 1050, completed: Date.now() - 1000 },
    providerID: provider, modelID: model, tokens: { input: 42, output: 1, reasoning: 0, cache: { read: 8, write: 0 } } }, parts: [] },
])
const result = async (signal?: AbortSignal) => JSON.parse(await budgetTool.execute({}, ctx(signal)) as string)
let dispose: (() => Promise<void>) | undefined
async function register(fetch: (request: Request) => Promise<Response>) {
  const client = createOpencodeClient({ baseUrl: "http://localhost:4096", directory, fetch })
  const hooks = await ContextBudgetPlugin({ client, directory, worktree: directory } as Parameters<typeof ContextBudgetPlugin>[0])
  dispose = hooks.dispose
}
afterEach(async () => { await dispose?.(); dispose = undefined; vi.useRealTimers() })

describe("manual exact-model fallback with real SDK custom transport", () => {
  it("uses exact full-model override when provider metadata throws, without exposing secrets", async () => {
    const fetch = vi.fn(async (request: Request) => {
      if (new URL(request.url).pathname === "/config/providers") throw new Error("secret provider key")
      return messages()
    })
    await register(fetch)
    const reading = await result()
    expect(reading).toMatchObject({ status: "measured", model: { providerID: provider, modelID },
      inputContextTokens: 50, capacity: { source: "manual-override", usableInputTokens: 200000 },
      limits: { target: 140000, stopNewWork: 160000, closeBy: 180000, dispatchReserve: 20000 } })
    expect(JSON.stringify(reading)).not.toContain("secret provider key")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("does not borrow a manual override for a different full model on provider failure", async () => {
    await register(async (request) => {
      if (new URL(request.url).pathname === "/config/providers") throw new Error("offline")
      return messages("anthropic/other")
    })
    expect(await result()).toMatchObject({ status: "unknown", capacity: null, inputContextTokens: null })
  })

  it("uses an exact-model override on an SDK metadata HTTP error without leaking its body", async () => {
    await register(async (request) => new URL(request.url).pathname === "/config/providers"
      ? new Response("private provider diagnostic", { status: 403 }) : messages())
    const reading = await result()
    expect(reading).toMatchObject({ status: "measured", capacity: { source: "manual-override", usableInputTokens: 200000 } })
    expect(JSON.stringify(reading)).not.toContain("private provider diagnostic")
  })

  it("prefers valid configured metadata over the exact-model manual override", async () => {
    await register(async (request) => new URL(request.url).pathname === "/config/providers"
      ? Response.json({ providers: [{ id: provider, models: { [modelID]: { limit: { context: 300000, output: 10000 } } } }] })
      : messages())
    expect(await result()).toMatchObject({ status: "measured", capacity: { source: "opencode-configured-model", usableInputTokens: 290000 } })
  })

  it.each([modelID, "anthropic/other"])("bounds hanging provider metadata and falls back only for the exact model %s", async (model) => {
    vi.useFakeTimers()
    let providerRequest: Request | undefined
    const fetch = vi.fn((request: Request): Promise<Response> => {
      if (new URL(request.url).pathname === "/config/providers") {
        providerRequest = request
        return new Promise(() => {})
      }
      return Promise.resolve(messages(model))
    })
    await register(fetch)
    const pending = result()
    await vi.advanceTimersByTimeAsync(5000)
    const reading = await pending
    expect(reading.status).toBe(model === modelID ? "measured" : "unknown")
    expect(reading.capacity?.source ?? null).toBe(model === modelID ? "manual-override" : null)
    expect(providerRequest?.signal.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("caller abort during hanging metadata never authorizes the manual override", async () => {
    let started!: () => void
    const providerStarted = new Promise<void>((resolve) => { started = resolve })
    let providerRequest: Request | undefined
    await register((request) => {
      if (new URL(request.url).pathname === "/config/providers") {
        providerRequest = request
        started()
        return new Promise(() => {})
      }
      return Promise.resolve(messages())
    })
    const abort = new AbortController()
    const pending = result(abort.signal)
    await providerStarted
    abort.abort()
    expect(await pending).toMatchObject({ status: "unknown", reason: "Tool invocation aborted", capacity: null })
    expect(providerRequest?.signal.aborted).toBe(true)
  })

  it("rechecks observation freshness at the deadline before manual fallback", async () => {
    vi.useFakeTimers()
    await register((request) => {
      if (new URL(request.url).pathname === "/config/providers") return new Promise(() => {})
      return Promise.resolve(Response.json([
        { info: { role: "user", id: "user", sessionID, time: { created: Date.now() - 119_100 }, model: { providerID: provider, modelID } }, parts: [] },
        { info: { role: "assistant", id: "assistant", sessionID, time: { created: Date.now() - 119_050, completed: Date.now() - 119_000 },
          providerID: provider, modelID, tokens: { input: 42, output: 1, reasoning: 0, cache: { read: 8, write: 0 } } }, parts: [] },
      ]))
    })
    const pending = result()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work", inputContextTokens: null })
  })

  it("never retries metadata when caller aborts while messages are pending", async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    await register(fetch)
    const abort = new AbortController()
    const pending = result(abort.signal)
    abort.abort()
    expect(await pending).toMatchObject({ status: "unknown", capacity: null })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

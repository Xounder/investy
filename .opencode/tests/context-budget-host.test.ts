import { afterEach, describe, expect, it, vi } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk"
import budgetTool from "../tools/read-context-budget"
import { ContextBudgetPlugin } from "../plugins/context-budget.plugin"

const directory = "C:/workspace"
const worktree = "C:/workspace"
const sessionID = "principal"

function message(session = sessionID) {
  return {
    info: {
      role: "assistant", id: "recent", sessionID: session,
      time: { created: Date.now() - 1_100, completed: Date.now() - 1_000 },
      providerID: "provider", modelID: "model",
      tokens: { input: 42, output: 1, reasoning: 0, cache: { read: 8, write: 0 } },
    }, parts: [],
  }
}
function user(modelID = "model") {
  return { info: { role: "user", id: "caller", sessionID, time: { created: Date.now() - 2_000 }, model: { providerID: "provider", modelID } }, parts: [] }
}
const providerResponse = () => Response.json({ providers: [{ id: "provider", models: { model: { limit: { context: 200_000, output: 8_000 } } } }] })
const sessionResponse = (session = sessionID) => Response.json([user(), message(session)])
const routed = (request: Request) => new URL(request.url).pathname === "/config/providers" ? providerResponse() : sessionResponse()

const ctx = (dir = directory, signal = new AbortController().signal) => ({
  sessionID, directory: dir, worktree, abort: signal,
}) as Parameters<typeof budgetTool.execute>[1]

let dispose: (() => Promise<void>) | undefined
afterEach(async () => { await dispose?.(); dispose = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })

describe("host-injected context budget transport", () => {
  it("uses the real SDK host fetch without a localhost listener; scopes the directory and caller session", async () => {
    const fetch = vi.fn(async (request: Request) => routed(request))
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096", directory,
      headers: { authorization: "Basic host-only" }, fetch })
    const hooks = await ContextBudgetPlugin({ client, directory, worktree } as Parameters<typeof ContextBudgetPlugin>[0])
    dispose = hooks.dispose
    const result = JSON.parse(await budgetTool.execute({}, ctx()) as string)
    expect(result).toMatchObject({ status: "measured", sessionID, inputContextTokens: 50 })
    expect(fetch).toHaveBeenCalledTimes(2)
    const request = fetch.mock.calls[0][0]
    const url = new URL(request.url)
    expect(url.pathname).toBe("/session/principal/message")
    expect(url.searchParams.get("directory")).toBe(directory)
    expect(url.searchParams.get("limit")).toBe("20")
    expect(request.headers.get("authorization")).toBe("Basic host-only")
    expect(new URL(fetch.mock.calls[1][0].url).pathname).toBe("/config/providers")
    expect(new URL(fetch.mock.calls[1][0].url).searchParams.get("directory")).toBe(directory)
  })

  it("does not borrow a client for another directory or worktree, and disposes only its own registration", async () => {
    const fetch = vi.fn(async (request: Request) => routed(request))
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096", directory, fetch })
    const hooks = await ContextBudgetPlugin({ client, directory, worktree } as Parameters<typeof ContextBudgetPlugin>[0])
    dispose = hooks.dispose
    expect(JSON.parse(await budgetTool.execute({ serverUrl: "https://example.com" }, ctx()) as string).status).toBe("unknown")
    expect(fetch).not.toHaveBeenCalled()
    // Registration is scoped to both the invoking directory and its worktree.
    const foreign = { ...ctx(), worktree: "C:/another-worktree" }
    // A deliberately aborted fallback avoids any network request.
    const aborted = new AbortController(); aborted.abort()
    expect(JSON.parse(await budgetTool.execute({}, { ...foreign, abort: aborted.signal }) as string).status).toBe("unknown")
    expect(JSON.parse(await budgetTool.execute({}, ctx()) as string).status).toBe("measured")
    await hooks.dispose?.()
    dispose = undefined
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("rejects foreign session messages and a failed SDK response without leaking error text", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(sessionResponse("another-session"))
      .mockResolvedValueOnce(providerResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "NotFoundError", data: { message: "secret" } }), { status: 404 }))
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096", directory, fetch })
    const hooks = await ContextBudgetPlugin({ client, directory, worktree } as Parameters<typeof ContextBudgetPlugin>[0])
    dispose = hooks.dispose
    expect(JSON.parse(await budgetTool.execute({}, ctx()) as string)).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work" })
    const result = await budgetTool.execute({}, ctx()) as string
    expect(JSON.parse(result).status).toBe("unknown")
    expect(JSON.parse(result).reason).toMatch(/HTTP 404/)
    expect(result).not.toContain("secret")
  })

  it("classifies access denial without returning SDK response contents", async () => {
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096", directory,
      fetch: async () => new Response("private diagnostic", { status: 403 }) })
    const hooks = await ContextBudgetPlugin({ client, directory, worktree } as Parameters<typeof ContextBudgetPlugin>[0])
    dispose = hooks.dispose
    const result = await budgetTool.execute({}, ctx()) as string
    expect(JSON.parse(result)).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work" })
    expect(JSON.parse(result).reason).toMatch(/HTTP 401\/403/)
    expect(result).not.toContain("private diagnostic")
  })

  it("uses the explicit loopback override instead of the host client", async () => {
    const hostFetch = vi.fn(async () => sessionResponse("foreign"))
    const overrideFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).host).toBe("127.0.0.1:5000")
      return routed(request)
    })
    vi.stubGlobal("fetch", overrideFetch)
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096", directory, fetch: hostFetch })
    const hooks = await ContextBudgetPlugin({ client, directory, worktree } as Parameters<typeof ContextBudgetPlugin>[0])
    dispose = hooks.dispose
    const result = JSON.parse(await budgetTool.execute({ serverUrl: "http://127.0.0.1:5000" }, ctx()) as string)
    expect(result).toMatchObject({ status: "measured", inputContextTokens: 50 })
    expect(hostFetch).not.toHaveBeenCalled()
    expect(overrideFetch).toHaveBeenCalledTimes(2)
  })

  it("treats a stale observation as unknown even over the host transport", async () => {
    const stale = message()
    stale.info.time.completed = Date.now() - 121_000
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096", directory,
      fetch: async (request: Request) => new URL(request.url).pathname === "/config/providers" ? providerResponse() : Response.json([user(), stale]) })
    const hooks = await ContextBudgetPlugin({ client, directory, worktree } as Parameters<typeof ContextBudgetPlugin>[0])
    dispose = hooks.dispose
    expect(JSON.parse(await budgetTool.execute({}, ctx()) as string)).toMatchObject({
      status: "unknown", policy: "unknown-stop-new-work", inputContextTokens: null,
    })
  })

  it("bounds a hanging host fetch and promptly handles invocation abort", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096", directory, fetch })
    const hooks = await ContextBudgetPlugin({ client, directory, worktree } as Parameters<typeof ContextBudgetPlugin>[0])
    dispose = hooks.dispose
    const pending = budgetTool.execute({}, ctx())
    await vi.advanceTimersByTimeAsync(5_000)
    expect(JSON.parse(await pending as string).reason).toMatch(/timed out/)
    const abort = new AbortController()
    const another = budgetTool.execute({}, ctx(directory, abort.signal))
    abort.abort()
    expect(JSON.parse(await another as string).reason).toBe("Tool invocation aborted")
  })
})

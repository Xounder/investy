import { describe, expect, it, vi } from "vitest"

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock("node:fs", () => ({ readFileSync: () => "{\"target\": 1}" }))
vi.mock("@opencode-ai/sdk", () => ({ createOpencodeClient: createClient }))

import budgetTool from "../tools/read-context-budget"

describe("invalid budget configuration", () => {
  it("returns unknown without contacting the SDK when policy fields are incomplete", async () => {
    const ctx = {
      sessionID: "principal", directory: "C:/workspace", worktree: "C:/workspace",
      abort: new AbortController().signal,
    } as Parameters<typeof budgetTool.execute>[1]
    const result = JSON.parse(await budgetTool.execute({}, ctx) as string)
    expect(result).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work", limits: null, inputContextTokens: null })
    expect(result.reason).toMatch(/configuration/)
    expect(createClient).not.toHaveBeenCalled()
  })
})

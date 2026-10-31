import { describe, expect, it } from "vitest"
import type { SessionMessagesResponse } from "@opencode-ai/sdk"
import { loadContextBudgetConfig, parseContextBudgetConfig, snapshotContextBudget } from "../lib/context-budget"

const config = loadContextBudgetConfig()
const observed = (input: number): SessionMessagesResponse => [{
  info: {
    role: "assistant", id: "latest", sessionID: "principal",
    time: { created: 999, completed: 1000 }, providerID: "provider", modelID: "model",
    tokens: { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }, parts: [],
}] as SessionMessagesResponse

describe("configured context budget", () => {
  it("loads the single authoritative configuration and applies its policy bands", () => {
    expect(config).toEqual({ target: 450000, stopNewWork: 580000, closeBy: 600000, absoluteContextReference: 1000000, dispatchReserve: 20000 })
    const limits = config!
    expect(snapshotContextBudget("principal", observed(limits.target), 1000, limits)).toMatchObject({
      status: "measured", policy: "continue", headroomToTarget: 0, headroomToStopNewWork: limits.stopNewWork - limits.target,
      limits: config,
    })
    expect(snapshotContextBudget("principal", observed(limits.target), 1000).limits).toEqual(config)
    // A continue reading is not authorization: at the effective admission ceiling,
    // even zero additional cost fails the strict gate after reserving closeout room.
    const ceiling = snapshotContextBudget("principal", observed(limits.stopNewWork - limits.dispatchReserve), 1000, limits)
    expect(ceiling.policy).toBe("continue")
    expect(ceiling.inputContextTokens! + limits.dispatchReserve < limits.stopNewWork).toBe(false)
    expect(limits.target + (limits.stopNewWork - limits.target - limits.dispatchReserve - 1) + limits.dispatchReserve < limits.stopNewWork).toBe(true)
    expect(snapshotContextBudget("principal", observed(limits.stopNewWork - 1), 1000, limits).policy).toBe("continue")
    expect(snapshotContextBudget("principal", observed(limits.stopNewWork), 1000, limits).policy).toBe("stop-new-work")
    expect(snapshotContextBudget("principal", observed(limits.closeBy - 1), 1000, limits).policy).toBe("stop-new-work")
    expect(snapshotContextBudget("principal", observed(limits.closeBy), 1000, limits)).toMatchObject({ policy: "close-now", headroomToCloseBy: 0 })
  })

  it("uses supplied valid values in headroom, semantics and policy without freezing defaults", () => {
    const other = parseContextBudgetConfig({ target: 100, stopNewWork: 200, closeBy: 300, absoluteContextReference: 400, dispatchReserve: 10 })
    const result = snapshotContextBudget("principal", observed(205), 1000, other)
    expect(result).toMatchObject({ policy: "stop-new-work", headroomToTarget: -105, headroomToStopNewWork: -5, headroomToCloseBy: 95, limits: other })
    expect(result.semantics).toContain("+ 10 reserve < 200")
    expect(result.semantics).toContain("model-context reference is user-selected")
    expect(snapshotContextBudget("principal", [], 1000, other)).toMatchObject({ status: "unknown", limits: other })
  })

  it.each([
    {}, null, [], { target: 100, stopNewWork: 200, closeBy: 300, absoluteContextReference: 400, dispatchReserve: 0 },
    { target: 100, stopNewWork: 200, closeBy: 300, absoluteContextReference: 400, dispatchReserve: 100 },
    { target: 100, stopNewWork: 100, closeBy: 300, absoluteContextReference: 400, dispatchReserve: 10 },
    { target: 100, stopNewWork: 200, closeBy: 200, absoluteContextReference: 400, dispatchReserve: 10 },
    { target: 100, stopNewWork: 200, closeBy: 500, absoluteContextReference: 400, dispatchReserve: 10 },
    { target: 100.5, stopNewWork: 200, closeBy: 300, absoluteContextReference: 400, dispatchReserve: 10 },
    { target: Infinity, stopNewWork: 200, closeBy: 300, absoluteContextReference: 400, dispatchReserve: 10 },
    { target: 100, stopNewWork: 200, closeBy: 300, absoluteContextReference: 400, dispatchReserve: 10, extra: 1 },
  ])("rejects malformed or unsafe configuration: %j", (value) => {
    expect(() => parseContextBudgetConfig(value)).toThrow()
  })

  it("does not invent limits or grant dispatch for missing configuration", () => {
    expect(loadContextBudgetConfig(new URL("./nonexistent-context-budget.json", import.meta.url))).toBeNull()
    expect(loadContextBudgetConfig(new URL("../package.json", import.meta.url))).toBeNull()
    expect(snapshotContextBudget("principal", observed(100), 1000, null)).toMatchObject({
      status: "unknown", policy: "unknown-stop-new-work", limits: null, inputContextTokens: null,
    })
  })
})

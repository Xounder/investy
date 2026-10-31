import { describe, expect, it } from "vitest"
import type { SessionMessagesResponse } from "@opencode-ai/sdk"
import { effectiveLimits, loadContextBudgetConfig, parseContextBudgetConfig, resolveCapacity, snapshotContextBudget } from "../lib/context-budget"

const config = loadContextBudgetConfig()!
const model = { providerID: "provider", modelID: "model" }
const observed = (input: number): SessionMessagesResponse => [
  { info: { role: "user", id: "user", sessionID: "principal", time: { created: 900 }, model }, parts: [] },
  { info: { role: "assistant", id: "latest", sessionID: "principal", time: { created: 999, completed: 1000 },
    ...model, tokens: { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [] },
] as SessionMessagesResponse

describe("dynamic configured budget", () => {
  it("scales 200k, 256k, 512k and caps 1m usable input capacity", () => {
    expect(config.mode).toBe("auto")
    for (const [usable, expected] of [
      [200_000, [140_000, 160_000, 180_000, 20_000]],
      [256_000, [179_200, 204_800, 230_400, 20_000]],
      [512_000, [358_400, 409_600, 460_800, 20_000]],
      [1_000_000, [450_000, 580_000, 600_000, 20_000]],
    ]) {
      const capacity = resolveCapacity(config, model, { limit: { context: usable + 8_000, output: 8_000 } })!
      const limits = effectiveLimits(config, capacity)!
      expect([limits.target, limits.stopNewWork, limits.closeBy, limits.dispatchReserve]).toEqual(expected)
      const atCeiling = snapshotContextBudget("principal", observed(limits.stopNewWork - limits.dispatchReserve), 1000, limits, capacity)
      expect(atCeiling.policy).toBe("continue")
      expect(atCeiling.inputContextTokens! + limits.dispatchReserve < limits.stopNewWork).toBe(false)
      expect(snapshotContextBudget("principal", observed(limits.stopNewWork), 1000, limits, capacity).policy).toBe("stop-new-work")
      expect(snapshotContextBudget("principal", observed(limits.closeBy), 1000, limits, capacity).policy).toBe("close-now")
    }
  })

  it("uses configured ratios and caps, integer rounding, and conservatively withholds output and input bounds", () => {
    const other = parseContextBudgetConfig({ ...config, ratios: { target: .5, stopNewWork: .7, closeBy: .9, dispatchReserve: .1 } })
    const capacity = resolveCapacity(other, model, { limit: { context: 401, output: 1, input: 300 } })!
    expect(capacity).toMatchObject({ source: "opencode-configured-model", usableInputTokens: 300, contextTokens: 401, maxOutputTokens: 1, inputTokens: 300 })
    expect(effectiveLimits(other, capacity)).toEqual({ target: 150, stopNewWork: 210, closeBy: 270, dispatchReserve: 30 })
    expect(resolveCapacity(config, model, { limit: { context: 200_000, output: 8_000 } })?.usableInputTokens).toBe(192_000)
  })

  it("allows only exact-model overrides for unusable metadata and never silently borrows another model", () => {
    const manual = parseContextBudgetConfig({ ...config, modelOverrides: { "provider/model": 200_000 } })
    expect(resolveCapacity(manual, model, null)).toMatchObject({ source: "manual-override", usableInputTokens: 200_000 })
    expect(resolveCapacity(manual, model, { limit: { context: 300_000, output: 10_000 } })?.source).toBe("opencode-configured-model")
    expect(resolveCapacity(manual, { ...model, modelID: "other" }, null)).toBeNull()
    expect(resolveCapacity(config, model, { limit: { context: 200_000 } })).toBeNull()
    expect(effectiveLimits(config, { source: "manual-override", usableInputTokens: 5, contextTokens: null, maxOutputTokens: null, inputTokens: null })).toBeNull()
  })

  it("accepts namespaced full model IDs and resolves only the exact provider plus full ID", () => {
    const nested = parseContextBudgetConfig({ ...config, modelOverrides: {
      "openrouter/anthropic/claude": 200_000, "openrouter/anthropic/claude-v2": 256_000,
    } })
    expect(resolveCapacity(nested, { providerID: "openrouter", modelID: "anthropic/claude" }, null)).toMatchObject({
      source: "manual-override", usableInputTokens: 200_000,
    })
    expect(resolveCapacity(nested, { providerID: "openrouter", modelID: "anthropic/claude-v2" }, null)?.usableInputTokens).toBe(256_000)
    expect(resolveCapacity(nested, { providerID: "anthropic", modelID: "claude" }, null)).toBeNull()
    expect(resolveCapacity(nested, { providerID: "openrouter", modelID: "claude" }, null)).toBeNull()
    expect(resolveCapacity(nested, { providerID: "openrouter", modelID: "anthropic/claude-v3" }, null)).toBeNull()
  })

  it.each([
    {}, null, [], { ...config, mode: "fixed" }, { ...config, extra: 1 },
    { ...config, ratios: { ...config.ratios, stopNewWork: 1 } },
    { ...config, ratios: { ...config.ratios, closeBy: .6 } },
    { ...config, caps: { ...config.caps, dispatchReserve: 0 } },
    { ...config, caps: { ...config.caps, stopNewWork: 450000 } },
    { ...config, modelOverrides: { "bad": 1000 } },
    { ...config, modelOverrides: { "/anthropic/claude": 1000 } },
    { ...config, modelOverrides: { "openrouter/": 1000 } },
    { ...config, modelOverrides: { "openrouter/anthropic/": 1000 } },
    { ...config, modelOverrides: { "openrouter//claude": 1000 } },
    { ...config, modelOverrides: { "openrouter/anthropic/claude model": 1000 } },
    { ...config, modelOverrides: { "provider/model": -1 } },
  ])("rejects malformed or unsafe configuration: %j", (value) => {
    expect(() => parseContextBudgetConfig(value)).toThrow()
  })

  it("does not invent limits for missing or invalid configuration", () => {
    expect(loadContextBudgetConfig(new URL("./nonexistent-context-budget.json", import.meta.url))).toBeNull()
    expect(loadContextBudgetConfig(new URL("../package.json", import.meta.url))).toBeNull()
    expect(snapshotContextBudget("principal", observed(100), 1000, null, null)).toMatchObject({ status: "unknown", policy: "unknown-stop-new-work", limits: null })
  })
})

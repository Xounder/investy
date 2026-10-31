import type { AssistantMessage, SessionMessagesResponse } from "@opencode-ai/sdk"
import { readFileSync } from "node:fs"

export type BudgetLimits = {
  target: number
  stopNewWork: number
  closeBy: number
  dispatchReserve: number
}
type Bands = { target: number; stopNewWork: number; closeBy: number; dispatchReserve: number }
export type BudgetConfig = {
  mode: "auto"
  ratios: Bands
  caps: Bands
  modelOverrides: Record<string, number>
}
export type Capacity = {
  source: "opencode-configured-model" | "manual-override"
  usableInputTokens: number
  contextTokens: number | null
  maxOutputTokens: number | null
  inputTokens: number | null
}

const configUrl = new URL("../context-budget.json", import.meta.url)
const maxObservationAgeMs = 120_000
const keys = ["target", "stopNewWork", "closeBy", "dispatchReserve"] as const
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0

export function parseContextBudgetConfig(value: unknown): BudgetConfig {
  if (!object(value) || Object.keys(value).sort().join() !== ["caps", "mode", "modelOverrides", "ratios"].join() || value.mode !== "auto" ||
      !object(value.ratios) || !object(value.caps) || !object(value.modelOverrides)) throw new Error("Invalid context budget configuration")
  const { ratios, caps, modelOverrides } = value
  if ([ratios, caps].some((band) => Object.keys(band).sort().join() !== [...keys].sort().join()) ||
      keys.some((key) => typeof ratios[key] !== "number" || !Number.isFinite(ratios[key]) || (ratios[key] as number) <= 0 || (ratios[key] as number) >= 1 || !positive(caps[key])) ||
      !(ratios.dispatchReserve < ratios.target && ratios.target < ratios.stopNewWork && ratios.stopNewWork < ratios.closeBy) ||
      !(caps.dispatchReserve < caps.target && caps.target < caps.stopNewWork && caps.stopNewWork < caps.closeBy) ||
      Object.entries(modelOverrides).some(([key, capacity]) => !/^[^/\s]+\/[^\s/]+(?:\/[^\s/]+)*$/.test(key) || !positive(capacity))) {
    throw new Error("Invalid context budget configuration fields")
  }
  return value as BudgetConfig
}

export function loadContextBudgetConfig(path: string | URL = configUrl): BudgetConfig | null {
  try { return parseContextBudgetConfig(JSON.parse(readFileSync(path, "utf8"))) } catch { return null }
}

// Output capacity is withheld from total context; an advertised input limit may lower it further.
// An explicit exact-model override states usable input capacity, not a discovered provider limit.
export function resolveCapacity(config: BudgetConfig, model: { providerID: string; modelID: string }, metadata: unknown): Capacity | null {
  const entry = object(metadata) ? metadata : null
  const limit = entry && object(entry.limit) ? entry.limit : null
  const context = limit?.context
  const output = limit?.output
  const input = limit?.input
  const usable = positive(context) && positive(output) && output < context &&
    (input === undefined || positive(input))
    ? Math.min(context - output, input === undefined ? context : input as number) : null
  if (usable && positive(usable)) return {
    source: "opencode-configured-model", usableInputTokens: usable, contextTokens: context as number,
    maxOutputTokens: output as number, inputTokens: input === undefined ? null : input as number,
  }
  const override = config.modelOverrides[`${model.providerID}/${model.modelID}`]
  return positive(override) ? { source: "manual-override", usableInputTokens: override, contextTokens: null, maxOutputTokens: null, inputTokens: null } : null
}

export function effectiveLimits(config: BudgetConfig, capacity: Capacity): BudgetLimits | null {
  const usable = capacity.usableInputTokens
  if (!positive(usable)) return null
  const bands = Object.fromEntries(keys.map((key) => [key, Math.min(Math.floor(usable * config.ratios[key]), config.caps[key])])) as BudgetLimits
  return positive(bands.dispatchReserve) && bands.dispatchReserve < bands.target && bands.target < bands.stopNewWork &&
    bands.stopNewWork < bands.closeBy && bands.closeBy < usable ? bands : null
}

export type Snapshot = {
  status: "measured" | "unknown"
  policy: "continue" | "stop-new-work" | "close-now" | "unknown-stop-new-work"
  sessionID: string
  messageID: string | null
  model: { providerID: string; modelID: string } | null
  capacity: Capacity | null
  observedAt: string | null
  inputContextTokens: number | null
  uncachedInputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  headroomToTarget: number | null
  headroomToStopNewWork: number | null
  headroomToCloseBy: number | null
  reason: string
  limits: BudgetLimits | null
  semantics: string
}

function semantics(limits: BudgetLimits | null): string {
  return "Latest completed assistant among 20 recent caller-session messages only; caller principal identity is not verified. Current model must match the newest caller user selection. inputContextTokens = input + cache.read + cache.write (conservative, possibly double-counted; not cumulative billing). Failed, zero-token, stale (>120 seconds), future, switched-model or unconfirmed-model observations are unknown. Snapshot lags in-flight work; compaction is not a reset. Model capacity comes from configured OpenCode SDK model limits (context minus max output, capped by input if present), or an explicit exact-model usable-input override if metadata is unusable; neither is provider-verified telemetry or an enforced cap. " + (limits ? `New dispatch requires observation + estimated additional principal cost + ${limits.dispatchReserve} reserve < ${limits.stopNewWork}; plan closeout at ${limits.target}, stop new work at ${limits.stopNewWork}, close by ${limits.closeBy}. Reserve is for mandatory closeout, not implementation.` : "Unknown configuration, capacity, model or limits: do not start new work.")
}

export function unknown(sessionID: string, reason: string, limits: BudgetLimits | null = null): Snapshot {
  return {
    status: "unknown", policy: "unknown-stop-new-work", sessionID, messageID: null, model: null, capacity: null,
    observedAt: null, inputContextTokens: null, uncachedInputTokens: null, cacheReadTokens: null, cacheWriteTokens: null,
    headroomToTarget: null, headroomToStopNewWork: null, headroomToCloseBy: null, reason, limits, semantics: semantics(limits),
  }
}

function validTokens(tokens: AssistantMessage["tokens"]): boolean {
  return [tokens?.input, tokens?.cache?.read, tokens?.cache?.write].every((value) => Number.isSafeInteger(value) && value >= 0)
}

export function currentModel(sessionID: string, messages: SessionMessagesResponse): { providerID: string; modelID: string } | null {
  if (!Array.isArray(messages)) return null
  const users = messages.map((entry) => entry?.info).filter((info) => info?.role === "user" && info.sessionID === sessionID)
    .sort((a, b) => b.time.created - a.time.created)
  const latest = users[0]
  return latest?.role === "user" && typeof latest.model?.providerID === "string" && latest.model.providerID.length > 0 &&
    typeof latest.model.modelID === "string" && latest.model.modelID.length > 0 && Number.isFinite(latest.time.created)
    ? { providerID: latest.model.providerID, modelID: latest.model.modelID } : null
}

export function snapshotContextBudget(sessionID: string, messages: SessionMessagesResponse, nowMs = Date.now(), limits: BudgetLimits | null = null, capacity: Capacity | null = null): Snapshot {
  if (!limits || !capacity) return unknown(sessionID, "Current model capacity or budget limits unavailable")
  if (!Array.isArray(messages)) return unknown(sessionID, "Invalid session messages response")
  if (!Number.isFinite(nowMs)) return unknown(sessionID, "Invalid invocation time")
  const selected = currentModel(sessionID, messages)
  if (!selected) return unknown(sessionID, "Current caller model selection unavailable")
  const completed = messages.map((entry) => entry?.info).filter((info): info is AssistantMessage =>
    info?.role === "assistant" && info.sessionID === sessionID && Number.isFinite(info.time?.completed))
    .sort((a, b) => (b.time.completed ?? 0) - (a.time.completed ?? 0))
  const latest = completed[0]
  if (!latest) return unknown(sessionID, "No completed assistant message in the recent session window")
  if (latest.providerID !== selected.providerID || latest.modelID !== selected.modelID) return unknown(sessionID, "Current model differs from latest completed assistant observation")
  if (latest.error) return unknown(sessionID, "Latest completed assistant message failed")
  if (!validTokens(latest.tokens)) return unknown(sessionID, "Latest completed message has invalid token counters")
  if (!latest.id || !latest.modelID || !latest.providerID || !Number.isFinite(latest.time.completed) || latest.time.completed! < 0)
    return unknown(sessionID, "Latest completed message lacks valid observation metadata")
  const age = nowMs - latest.time.completed!
  if (age < 0 || age > maxObservationAgeMs) return unknown(sessionID, "Latest completed message is stale or in the future")
  const total = latest.tokens.input + latest.tokens.cache.read + latest.tokens.cache.write
  if (!Number.isSafeInteger(total)) return unknown(sessionID, "Input context total exceeds safe integer range")
  if (total === 0) return unknown(sessionID, "Latest completed assistant message has no input token measurement")
  const date = new Date(latest.time.completed!)
  if (!Number.isFinite(date.getTime())) return unknown(sessionID, "Latest completed message has an invalid timestamp")
  return {
    status: "measured", policy: total >= limits.closeBy ? "close-now" : total >= limits.stopNewWork ? "stop-new-work" : "continue",
    sessionID, messageID: latest.id, model: selected, capacity, observedAt: date.toISOString(), inputContextTokens: total,
    uncachedInputTokens: latest.tokens.input, cacheReadTokens: latest.tokens.cache.read, cacheWriteTokens: latest.tokens.cache.write,
    headroomToTarget: limits.target - total, headroomToStopNewWork: limits.stopNewWork - total,
    headroomToCloseBy: limits.closeBy - total, reason: "Completed assistant token snapshot; in-flight activity is not included",
    limits, semantics: semantics(limits),
  }
}

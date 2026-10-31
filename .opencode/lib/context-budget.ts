import type { AssistantMessage, SessionMessagesResponse } from "@opencode-ai/sdk"
import { readFileSync } from "node:fs"

export type BudgetLimits = {
  target: number
  stopNewWork: number
  closeBy: number
  absoluteContextReference: number
  dispatchReserve: number
}

const configUrl = new URL("../context-budget.json", import.meta.url)
const maxObservationAgeMs = 120_000

export function parseContextBudgetConfig(value: unknown): BudgetLimits {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid context budget configuration")
  const keys = ["target", "stopNewWork", "closeBy", "absoluteContextReference", "dispatchReserve"] as const
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length ||
      !keys.every((key) => Number.isSafeInteger(record[key]) && (record[key] as number) > 0)) {
    throw new Error("Invalid context budget configuration fields")
  }
  const limits = Object.fromEntries(keys.map((key) => [key, record[key]])) as BudgetLimits
  if (!(limits.dispatchReserve < limits.target && limits.target < limits.stopNewWork &&
        limits.stopNewWork < limits.closeBy && limits.closeBy <= limits.absoluteContextReference)) {
    throw new Error("Invalid context budget configuration ordering")
  }
  return limits
}

// Read on each invocation: invalid or unavailable configuration never grants dispatch.
export function loadContextBudgetConfig(path: string | URL = configUrl): BudgetLimits | null {
  try {
    return parseContextBudgetConfig(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return null
  }
}

export type Snapshot = {
  status: "measured" | "unknown"
  policy: "continue" | "stop-new-work" | "close-now" | "unknown-stop-new-work"
  sessionID: string
  messageID: string | null
  model: { providerID: string; modelID: string } | null
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
  return "Latest completed assistant message among 20 recent messages in the tool caller's session only (not summed turns or child sessions); no usable completed message in the window means unknown. Tool context cannot verify whether caller is principal. inputContextTokens = tokens.input + tokens.cache.read + tokens.cache.write. SDK exposes separate cache counters but does not guarantee provider accounting; summing is conservative and may double-count for some providers. Not cumulative billing. Failed or zero-token messages and observations older than 120 seconds or in the future are unknown. Snapshot lags in-flight reads/tool output; compaction does not establish a reset or a hard cap. " + (limits ? `For a new dispatch require current observation + estimated additional principal cost + ${limits.dispatchReserve} reserve < ${limits.stopNewWork}; begin planning closeout at ${limits.target}, stop new work at ${limits.stopNewWork}, close by ${limits.closeBy}. The ${limits.absoluteContextReference} model-context reference is user-selected, not verified telemetry or an enforced cap.` : "Budget configuration unavailable or invalid: do not start new work.")
}

export function unknown(sessionID: string, reason: string, limits: BudgetLimits | null = loadContextBudgetConfig()): Snapshot {
  return {
    status: "unknown", policy: "unknown-stop-new-work", sessionID,
    messageID: null, model: null, observedAt: null,
    inputContextTokens: null, uncachedInputTokens: null,
    cacheReadTokens: null, cacheWriteTokens: null,
    headroomToTarget: null, headroomToStopNewWork: null, headroomToCloseBy: null,
    reason, limits, semantics: semantics(limits),
  }
}

function validTokens(tokens: AssistantMessage["tokens"]): boolean {
  return [tokens?.input, tokens?.cache?.read, tokens?.cache?.write].every(
    (value) => Number.isSafeInteger(value) && value >= 0,
  )
}

export function snapshotContextBudget(sessionID: string, messages: SessionMessagesResponse, nowMs = Date.now(), limits: BudgetLimits | null = loadContextBudgetConfig()): Snapshot {
  if (!limits) return unknown(sessionID, "Context budget configuration unavailable or invalid", null)
  if (!Array.isArray(messages)) return unknown(sessionID, "Invalid session messages response", limits)
  if (!Number.isFinite(nowMs)) return unknown(sessionID, "Invalid invocation time", limits)
  const completed = messages
    .map((entry) => entry?.info)
    .filter((info): info is AssistantMessage =>
      info?.role === "assistant" && info.sessionID === sessionID &&
      Number.isFinite(info.time?.completed),
    )
    .sort((a, b) => (b.time.completed ?? 0) - (a.time.completed ?? 0))
  const latest = completed[0]
  if (!latest) return unknown(sessionID, "No completed assistant message in the recent session window", limits)
  if (latest.error) return unknown(sessionID, "Latest completed assistant message failed", limits)
  if (!validTokens(latest.tokens)) return unknown(sessionID, "Latest completed message has invalid token counters", limits)
  if (!latest.id || !latest.modelID || !latest.providerID ||
      !Number.isFinite(latest.time.completed) || latest.time.completed! < 0) {
    return unknown(sessionID, "Latest completed message lacks valid observation metadata", limits)
  }
  const age = nowMs - latest.time.completed!
  if (age < 0 || age > maxObservationAgeMs) {
    return unknown(sessionID, "Latest completed message is stale or in the future", limits)
  }
  const total = latest.tokens.input + latest.tokens.cache.read + latest.tokens.cache.write
  if (!Number.isSafeInteger(total)) return unknown(sessionID, "Input context total exceeds safe integer range", limits)
  if (total === 0) return unknown(sessionID, "Latest completed assistant message has no input token measurement", limits)
  const date = new Date(latest.time.completed!)
  if (!Number.isFinite(date.getTime())) return unknown(sessionID, "Latest completed message has an invalid timestamp", limits)
  return {
    status: "measured",
    policy: total >= limits.closeBy ? "close-now" : total >= limits.stopNewWork ? "stop-new-work" : "continue",
    sessionID, messageID: latest.id,
    model: { providerID: latest.providerID, modelID: latest.modelID },
    observedAt: date.toISOString(), inputContextTokens: total,
    uncachedInputTokens: latest.tokens.input,
    cacheReadTokens: latest.tokens.cache.read,
    cacheWriteTokens: latest.tokens.cache.write,
    headroomToTarget: limits.target - total,
    headroomToStopNewWork: limits.stopNewWork - total,
    headroomToCloseBy: limits.closeBy - total,
    reason: "Completed assistant token snapshot; in-flight activity is not included",
    limits, semantics: semantics(limits),
  }
}

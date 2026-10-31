import type { Plugin } from "@opencode-ai/plugin"
import { registerContextBudgetClient } from "../lib/context-budget-client"

// The host supplies its own authenticated client and in-process transport even when
// the TUI has no reachable HTTP listener. Do not register a duplicate tool here.
export const ContextBudgetPlugin: Plugin = async ({ client, directory, worktree }) => {
  const dispose = registerContextBudgetClient(directory, worktree, client)
  return { dispose: async () => { dispose() } }
}

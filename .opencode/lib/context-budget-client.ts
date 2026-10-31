import type { createOpencodeClient } from "@opencode-ai/sdk"

// Plugin instances are project-scoped. Never borrow a client from another directory.
type Client = ReturnType<typeof createOpencodeClient>
const clients = new Map<string, { client: Client; worktree: string }>()

export function registerContextBudgetClient(directory: string, worktree: string, client: Client): () => void {
  const entry = { client, worktree }
  clients.set(directory, entry)
  return () => {
    if (clients.get(directory) === entry) clients.delete(directory)
  }
}

export function contextBudgetClient(directory: string, worktree: string): Client | undefined {
  const entry = clients.get(directory)
  return entry?.worktree === worktree ? entry.client : undefined
}

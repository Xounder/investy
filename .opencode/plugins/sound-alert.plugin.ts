import type { Plugin } from "@opencode-ai/plugin"

export const SoundAlertPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  const beep = async (freq: number, duration: number, repeat: number) => {
    try {
      for (let i = 0; i < repeat; i++) {
        await $`powershell -c "[System.Console]::Beep(${freq}, ${duration})"`
        if (repeat > 1) {
          await new Promise(r => setTimeout(r, 100))
        }
      }
    } catch {
      // Silently fail
    }
  }

  return {
    "permission.ask": async () => {
      await beep(800, 300, 3)
    },
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await beep(600, 500, 2)
      }
    }
  }
}

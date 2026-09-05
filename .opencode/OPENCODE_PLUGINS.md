# OpenCode Plugin Development Guide

Key findings and patterns discovered while developing plugins for OpenCode v1.15.10.

## File Structure

Plugins must be placed in `.opencode/plugins/` with the naming convention `*.plugin.ts` or `*.plugin.js`. Files in this directory are auto-loaded by OpenCode — no configuration needed in `opencode.jsonc`.

```
.opencode/plugins/
  session-load-autoloader.plugin.ts   # TypeScript
  validate-agent.plugin.ts            # TypeScript
  sound-alert.plugin.ts               # TypeScript
```

## Export Pattern

Plugins must use **named export** (`export const`), not `export default`.

```ts
// ✅ Correct
export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return { /* hooks */ }
}

// ❌ Wrong — does not load
export default MyPlugin
```

## Plugin Function Signature

The plugin function receives a context object with exactly 5 properties. All must be destructured for the plugin to work reliably:

| Parameter     | Description                        |
|---------------|------------------------------------|
| `project`     | Current project info               |
| `client`      | OpenCode SDK client for logging    |
| `$`           | Bun shell API for shell commands   |
| `directory`   | Project root directory path        |
| `worktree`    | Git worktree path                  |

```ts
export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
```

## Hooks API (`@opencode-ai/plugin` v1.15.10)

The `Hooks` interface defines the available hooks. **Named hooks like `session.created`, `session.updated`, `session.idle`, `file.edited`, or `permission.asked` do NOT exist in this version.** Only the hooks listed below are valid. Any other hook name is silently ignored.

### Available Hooks (confirmed working)

| Hook                              | Purpose                                   | Works? |
|-----------------------------------|-------------------------------------------|--------|
| `event`                           | Catch-all for all event types             | ✅     |
| `chat.message`                    | Fires when a new message is received      | ✅     |
| `tool.execute.after`              | After a tool execution                    | ✅     |
| `permission.ask`                  | Before a permission prompt                | ✅     |
| `chat.params`                     | Modify LLM parameters                     | ⚠️     |
| `chat.headers`                    | Modify LLM request headers                | ⚠️     |
| `tool.execute.before`             | Before a tool execution                   | ⚠️     |
| `shell.env`                       | Inject environment variables              | ⚠️     |
| `command.execute.before`          | Before a command execution                | ⚠️     |
| `experimental.chat.system.transform` | Inject content into system prompt      | ❌ (exists in types, not wired in runtime) |
| `experimental.session.compacting` | Customize session compaction prompt       | ❌     |

### Named hooks that look valid but ARE NOT (common mistakes)

| Hook name            | Why it doesn't work                               | Correct approach                     |
|----------------------|----------------------------------------------------|---------------------------------------|
| `session.created`    | Not a valid hook key                               | Use `event` hook + `event.type` check |
| `session.updated`    | Not a valid hook key                               | Use `event` hook + `event.type` check |
| `session.idle`       | Not a valid hook key                               | Use `event` hook + `event.type` check |
| `file.edited`        | Not a valid hook key                               | Use `tool.execute.after` or `event`   |
| `permission.asked`   | Past tense — only `permission.ask` exists          | Use `permission.ask`                  |

### Catching Session Events via the `event` Hook

The `event` hook is a catch-all that receives all event types. Use it to listen for session lifecycle events:

```ts
export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        // Fires very early — may fire before plugin loads, unreliable
      }
      if (event.type === "session.updated") {
        // Reliable — fires after plugin initialization
      }
      if (event.type === "session.status") {
        // Also reliable
      }
      if (event.type === "session.idle") {
        // Fires after user inactivity
      }
    }
  }
}
```

### Known Event Types

From the SDK type definitions (`@opencode-ai/sdk` v1.15.10):

| Event type                    | Description                       |
|-------------------------------|-----------------------------------|
| `session.created`             | Session created (fires early)     |
| `session.updated`             | Session state updated             |
| `session.status`              | Session status changed            |
| `session.idle`                | User idle timeout                 |
| `session.diff`                | Session diff generated            |
| `session.error`               | Session error occurred            |
| `session.deleted`             | Session deleted                   |
| `session.compacted`           | Session compacted                 |
| `message.updated`             | Message updated                   |
| `message.part.updated`        | Message part updated              |
| `message.part.delta`          | Streaming message part delta      |
| `message.removed`             | Message removed                   |
| `message.part.removed`        | Message part removed              |
| `file.edited`                 | File edited                       |
| `file.watcher.updated`        | File watcher change               |
| `todo.updated`                | Todo list updated                 |
| `command.executed`            | Command executed                  |
| `server.connected`            | Server connected                  |
| `permission.replied`          | Permission prompt replied         |
| `permission.updated`          | Permission state updated          |
| `lsp.updated`                 | LSP diagnostics updated           |
| `lsp.client.diagnostics`      | LSP client diagnostics            |
| `installation.updated`        | Installation updated              |
| `installation.updateAvailable` | Update available                 |
| `vcs.branch.updated`          | Git branch changed                |
| `tui.prompt.append`           | TUI prompt appended               |
| `tui.command.execute`         | TUI command executed              |
| `tui.toast.show`              | TUI toast notification            |
| `pty.created`                 | PTY created                       |
| `pty.updated`                 | PTY updated                       |
| `pty.exited`                  | PTY exited                        |
| `pty.deleted`                 | PTY deleted                       |

### Injecting Context into the Agent

`experimental.chat.system.transform` is listed in the type definitions but is **not wired in the runtime** (v1.15.10). Use the `chat.message` hook instead to inject context by prepending to the user's first message:

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

export const MyPlugin: Plugin = async ({ directory }) => {
  let sessionContent: string | null = null

  try {
    const sessionsDir = join(directory, ".opencode", "sessions")
    const allFiles = readdirSync(sessionsDir)
    const tmpFiles = allFiles
      .filter(f => f.endsWith(".tmp"))
      .map(f => ({
        path: join(sessionsDir, f),
        mtime: statSync(join(sessionsDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime)

    if (tmpFiles.length > 0) {
      sessionContent = readFileSync(tmpFiles[0].path, "utf-8")
    }
  } catch {
    // Silently fail
  }

  let injected = false

  return {
    "chat.message": async (_input, output) => {
      if (sessionContent && !injected) {
        injected = true
        for (const part of output.parts) {
          if (part.type === "text") {
            ;(part as any).text = `[Previous Session Context]\n${sessionContent}\n\n${(part as any).text}`
            break
          }
        }
      }
    }
  }
}
```

### Monitoring File Changes

Neither `file.edited` nor `file.watcher.updated` exist as named hooks. Use `tool.execute.after` to detect file edits made by the AI:

```ts
export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.after": async (input) => {
      const filePath = (input as any).args?.filePath || (input as any).args?.path
      if (!filePath?.endsWith("pipeline.yaml")) return

      const content = await $`cat ${filePath}`.quiet().text()
      // Validate content...
    }
  }
}
```

### Playing Sounds on Windows

Use `[System.Console]::Beep()` instead of WAV files for reliable cross-platform sound:

```ts
const beep = async (freq: number, duration: number, repeat: number) => {
  for (let i = 0; i < repeat; i++) {
    await $`powershell -c "[System.Console]::Beep(${freq}, ${duration})"`
    if (repeat > 1) await new Promise(r => setTimeout(r, 100))
  }
}
```

### Using `chat.message` for Debugging

`chat.message` fires reliably on every user message. Use it to verify your plugin is loaded and hooks are working:

```ts
export const MyPlugin: Plugin = async (...) => {
  console.log("[my-plugin] PLUGIN_INITIALIZED")
  return {
    "chat.message": async () => {
      console.log("[my-plugin] CHAT_MESSAGE") // Confirms hooks work
    }
  }
}
```

### Key Timing Considerations

- `session.created` fires **before** plugins load — do not rely on it
- Always read files **synchronously** at plugin init time to avoid race conditions
- The `event` hook is the only way to catch session events reliably
- `experimental.*` hooks exist in type definitions but may not be wired in the runtime
- Add `chat.message` as a diagnostic hook when testing — it always fires on user input

## File Operations

The plugin runtime supports both Node.js `fs` module and Bun's `$` shell API:

### Using `fs` (recommended for file I/O)

```ts
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
```

Works cross-platform (Node.js compatibility in Bun runtime). Use for synchronous file operations at initialization time.

### Using `$` (Bun shell API)

```ts
const result = await $`ls -t ${dir}/*.tmp 2>/dev/null`.quiet().text()
```

Bun's `$` shell API handles cross-platform command translation (e.g., `ls`, `cat` work on Windows). Use for async shell operations.

### Import Rules

- Use `import type` for type-only imports (required by `verbatimModuleSyntax`)
- Avoid importing from npm packages not listed in `.opencode/package.json`
- Install external dependencies in `.opencode/package.json`

## Sources

Information in this guide was obtained from:

| Source | File/Location |
|--------|---------------|
| `Hooks` interface types | `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts` |
| `Event` type union (all event types) | `.opencode/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` |
| Plugin loading behavior (export pattern, auto-loading) | [opencode.ai/docs/pt-br/plugins/](https://opencode.ai/docs/pt-br/plugins/) |
| Hook behavior (which hooks fire in practice) | Empirical testing via `console.log` in each hook |
| Cross-platform patterns | Comparing `validate-agent.plugin.ts`, `sound-alert.plugin.ts`, `session-load-autoloader.plugin.ts` |
| Windows sound approach | `sound-alert.plugin.ts` — `[System.Console]::Beep()` via PowerShell |

## Running on Windows

The plugin runtime uses Bun, which provides cross-platform compatibility:
- `Bun.$` shell API translates Unix commands to Windows equivalents
- Node.js `fs` module works natively
- `console.log()` output appears in the OpenCode UI (bottom-left corner)
- `client.app.log()` provides structured logging

## Debugging Checklist

If a plugin doesn't load or hooks don't fire:

1. Check `console.log("PLUGIN_INITIALIZED")` appears at startup
2. Verify the export is `export const`, not `export default`
3. Verify the file is in `.opencode/plugins/` with `.plugin.ts` extension
4. Check `@opencode-ai/plugin` version in `.opencode/package.json`
5. Test with a minimal JS file to isolate TypeScript vs runtime issues
6. Use the `event` hook to log all `event.type` values
7. Never rely on named hooks like `"session.created"` — use the `event` hook instead
8. Read files synchronously at init time to avoid race conditions

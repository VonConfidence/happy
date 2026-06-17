# New Session Project Codex Import Design

## Goal

On the `/new` screen, let the user refresh and inspect all Codex sessions that already exist for the currently selected machine and project path, even when those sessions were not created from Happy. Mark those sessions as external Codex sessions and let the user open them by importing them into Happy first.

## Scope

- Add a refresh action to the project area on the `/new` screen.
- Scan the selected machine for Codex sessions that belong to the currently selected project path.
- Show those scanned sessions in the same `/new` project area with an explicit external Codex marker.
- Allow tapping an external Codex session to import it into Happy, then navigate to the imported Happy session detail screen.
- Reuse the existing Happy session screen after import instead of introducing a separate read-only viewer.

Out of scope:

- Live background syncing of external Codex sessions without user action
- Editing or mutating the original external Codex thread
- Adding a new standalone transcript viewer route
- Supporting non-Codex external session formats in this change

## User Experience

The `/new` screen keeps the current machine and project selection flow. Once a machine and project path are selected, the project area exposes a refresh control for external Codex sessions.

When the user refreshes:

- Happy asks the daemon for all Codex sessions associated with the selected project path on the selected machine.
- The screen shows a loading state while the scan runs.
- The results appear as a list below the project selector.
- Each row is marked as an external Codex session and shows enough metadata to distinguish sessions quickly: title or prompt summary, last updated time, and thread identifier preview.

When the user taps an external Codex session:

- Happy calls an import RPC.
- The daemon reads the Codex thread, converts it into Happy session envelopes, creates a new Happy session bound to that `codexThreadId`, and returns the new Happy session id.
- The app navigates to the standard Happy session detail screen for the imported session.

If the selected machine is offline, no machine is selected, or the project path is empty, the refresh action is disabled.

## Architecture

### App

`packages/happy-app/sources/app/(app)/new/index.tsx`

- Add local UI state for:
  - external Codex session list
  - refresh loading state
  - import-in-progress session id
  - refresh/import error presentation
- Render a compact external-session section beneath the current project selector area.
- Trigger a fetch when the user presses refresh, using the selected machine id and normalized selected path.
- Import and navigate when the user taps a row.

`packages/happy-app/sources/sync/ops.ts`

- Add a typed `listCodexProjectSessions()` RPC helper.
- Add a typed `importCodexProjectSession()` RPC helper.

The `/new` screen should not reach into `apiSocket` directly. It should continue to go through typed sync ops helpers.

### Daemon / CLI

`packages/happy-cli/src/api/apiMachine.ts`

- Register `codex-list-project-sessions`.
- Register `codex-import-project-session`.

The list RPC returns summaries for external Codex sessions discoverable for a project path. The import RPC creates a Happy session from one selected external Codex thread and returns the new Happy session id.

Implementation should stay inside daemon-side handlers so the mobile/web app does not need direct file or Codex app-server access.

### Codex session discovery

Introduce a daemon-side utility that can discover Codex sessions for a project path. The utility should:

- derive the project-specific Codex storage location from the selected directory
- enumerate candidate Codex sessions for that project
- load enough thread metadata to build stable summaries
- exclude Codex threads already referenced by existing Happy sessions for the same machine when possible

The first version should prefer correctness and bounded IO over aggressive caching. User-triggered refresh is enough for now.

### Import flow

Import should create a normal Happy session rather than a special read-only entity. The imported Happy session must include:

- `metadata.flavor = 'codex'`
- `metadata.codexThreadId`
- project path and machine metadata needed by existing session screens
- mapped transcript messages derived from the external Codex thread

This keeps session detail rendering on the existing path and makes later resume/fork flows work with the imported session.

## Data Contracts

### List result

The app needs a compact summary shape:

- `codexThreadId: string`
- `title: string`
- `updatedAt: number`
- `messageCount?: number`
- `previewText?: string`
- `alreadyImported?: boolean`

`alreadyImported` may be omitted if the daemon filters imported threads out completely. Filtering them out is the recommended default to keep the list focused on external sessions only.

### Import result

- success: `{ type: 'success'; sessionId: string }`
- error: `{ type: 'error'; errorMessage: string }`

The RPC should be idempotent enough that repeated imports of the same thread either:

- return the existing imported Happy session, or
- create one deterministic new mapping only once

The recommended behavior is to reuse an existing Happy session for the same machine + `codexThreadId` if one already exists.

## Error Handling

- Machine offline: disable refresh and import actions.
- Missing or invalid selected path: disable refresh and clear stale external-session results.
- Codex CLI/app-server unavailable on daemon machine: return a clear error message.
- Thread disappears between refresh and import: show an import failure message and keep the list visible.
- Partial or unreadable thread data: skip the broken entry during list if possible; fail import explicitly if the selected thread cannot be read.

The UI should never replace the existing path picker behavior with a hard failure. External-session discovery is additive.

## Testing

Add focused coverage before implementation:

### App tests

- `packages/happy-app/sources/sync/ops.*.test.ts`
  - lists external Codex project sessions through machine RPC
  - imports an external Codex session through machine RPC
- `/new` screen or extracted helper tests if a pure helper is introduced for section visibility / disabled-state logic

### CLI tests

- `packages/happy-cli/src/api/apiMachine.*.test.ts`
  - registers and serves `codex-list-project-sessions`
  - registers and serves `codex-import-project-session`
  - reuses an existing Happy session for an already imported `codexThreadId` when applicable

### Utility tests

- project-session discovery utility tests for:
  - locating sessions for one project path
  - excluding imported threads
  - deriving summary metadata from thread data

## Risks

- Codex on-disk or app-server thread storage may not expose a simple list-by-project primitive, so discovery may need a small repository-specific adapter.
- Importing large threads could be expensive; this version is user-triggered and acceptable, but may need caching later.
- Reusing an imported Happy session requires careful matching to avoid duplicates across machines.

## Open Choices Resolved

- External sessions are imported into normal Happy sessions before viewing.
- The `/new` screen shows a dedicated external Codex session list, not just path suggestions.
- The external list is fetched only on explicit refresh.

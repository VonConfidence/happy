# New Session Project Codex Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a refreshable external Codex session list to the `/new` screen project area and let users open one by importing it into Happy through the existing Codex resume flow.

**Architecture:** The daemon will scan local Codex session files for the selected project path and expose a new machine RPC that returns external session summaries. The app will call that RPC from the `/new` screen, render a marked list, and reuse the existing `spawn-happy-session` flow with `resumeCodexThreadId` so `runCodex.ts` can backfill transcript history into a normal Happy session automatically.

**Tech Stack:** TypeScript, Vitest, React Native / Expo, Happy machine RPC, Codex session JSONL files under `~/.codex`

**Note:** Repo instruction says not to create commits for this task, so commit steps are intentionally omitted.

---

## File Structure

- Create: `packages/happy-cli/src/codex/listProjectSessions.ts`
  Purpose: discover external Codex sessions for a project path by scanning `~/.codex/session_index.jsonl` plus session JSONL files under `~/.codex/sessions` and `~/.codex/archived_sessions`.

- Create: `packages/happy-cli/src/codex/listProjectSessions.test.ts`
  Purpose: validate discovery, project-path filtering, summary extraction, and imported-thread exclusion.

- Modify: `packages/happy-cli/src/api/apiMachine.ts`
  Purpose: register the new `codex-list-project-sessions` machine RPC and reuse the discovery helper.

- Modify: `packages/happy-cli/src/api/apiMachine.codexFork.test.ts`
  Purpose: verify the new RPC handler wiring and return shape.

- Modify: `packages/happy-app/sources/sync/ops.ts`
  Purpose: add a typed client helper for `codex-list-project-sessions`.

- Modify: `packages/happy-app/sources/sync/ops.codexFork.test.ts`
  Purpose: verify the new app-side RPC helper.

- Create: `packages/happy-app/sources/utils/externalCodexSessions.ts`
  Purpose: keep `/new` screen filtering and row formatting small and testable.

- Create: `packages/happy-app/sources/utils/externalCodexSessions.test.ts`
  Purpose: cover disabled-state gating, path/thread filtering, and selected project matching.

- Modify: `packages/happy-app/sources/app/(app)/new/index.tsx`
  Purpose: add refresh button, loading/error state, external-session rows, and click-to-import behavior.

### Task 1: Codex project-session discovery helper

**Files:**
- Create: `packages/happy-cli/src/codex/listProjectSessions.ts`
- Create: `packages/happy-cli/src/codex/listProjectSessions.test.ts`

- [ ] **Step 1: Write the failing discovery tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('listProjectSessions', () => {
    let codexHome: string;

    beforeEach(async () => {
        codexHome = await mkdtemp(join(os.tmpdir(), 'codex-home-'));
        await mkdir(join(codexHome, 'sessions', '2026', '06', '16'), { recursive: true });
        await mkdir(join(codexHome, 'archived_sessions'), { recursive: true });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('returns sessions whose session_meta cwd matches the selected project path', async () => {
        vi.stubEnv('CODEX_HOME', codexHome);
        await writeFile(
            join(codexHome, 'session_index.jsonl'),
            [
                JSON.stringify({ id: 'thread-1', thread_name: 'Fix sidebar', updated_at: '2026-06-16T03:00:00Z' }),
                JSON.stringify({ id: 'thread-2', thread_name: 'Other project', updated_at: '2026-06-16T04:00:00Z' }),
            ].join('\n') + '\n',
        );
        await writeFile(
            join(codexHome, 'sessions', '2026', '06', '16', 'rollout-1.jsonl'),
            [
                JSON.stringify({ type: 'session_meta', payload: { id: 'thread-1', cwd: '/repo/app' } }),
                JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix sidebar' }] } }),
            ].join('\n') + '\n',
        );
        await writeFile(
            join(codexHome, 'archived_sessions', 'rollout-2.jsonl'),
            [
                JSON.stringify({ type: 'session_meta', payload: { id: 'thread-2', cwd: '/repo/other' } }),
            ].join('\n') + '\n',
        );

        const { listProjectSessions } = await import('./listProjectSessions');
        const result = await listProjectSessions({
            directory: '/repo/app',
            importedThreadIds: new Set<string>(),
        });

        expect(result).toEqual([
            expect.objectContaining({
                codexThreadId: 'thread-1',
                title: 'Fix sidebar',
            }),
        ]);
    });

    it('filters out threads already imported into Happy', async () => {
        vi.stubEnv('CODEX_HOME', codexHome);
        await writeFile(
            join(codexHome, 'session_index.jsonl'),
            JSON.stringify({ id: 'thread-1', thread_name: 'Imported already', updated_at: '2026-06-16T03:00:00Z' }) + '\n',
        );
        await writeFile(
            join(codexHome, 'archived_sessions', 'rollout-1.jsonl'),
            JSON.stringify({ type: 'session_meta', payload: { id: 'thread-1', cwd: '/repo/app' } }) + '\n',
        );

        const { listProjectSessions } = await import('./listProjectSessions');
        const result = await listProjectSessions({
            directory: '/repo/app',
            importedThreadIds: new Set(['thread-1']),
        });

        expect(result).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest packages/happy-cli/src/codex/listProjectSessions.test.ts`

Expected: FAIL because `./listProjectSessions` does not exist yet.

- [ ] **Step 3: Write the minimal discovery helper**

```ts
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import os from 'node:os';
import { join, resolve } from 'node:path';

export interface CodexProjectSessionSummary {
    codexThreadId: string;
    title: string;
    updatedAt: number;
    previewText?: string;
}

export async function listProjectSessions(opts: {
    directory: string;
    importedThreadIds: Set<string>;
}): Promise<CodexProjectSessionSummary[]> {
    const codexHome = resolve(process.env.CODEX_HOME ?? join(os.homedir(), '.codex'));
    const selectedDir = resolve(opts.directory);
    const indexById = await readIndex(join(codexHome, 'session_index.jsonl'));
    const files = [
        ...glob.sync(join(codexHome, 'sessions', '**', '*.jsonl')),
        ...glob.sync(join(codexHome, 'archived_sessions', '*.jsonl')),
    ];

    const summaries: CodexProjectSessionSummary[] = [];
    for (const file of files) {
        const summary = await readSummaryFromFile(file, selectedDir, indexById, opts.importedThreadIds);
        if (summary) summaries.push(summary);
    }

    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function readIndex(indexPath: string): Promise<Map<string, { threadName: string; updatedAt: number }>> {
    const out = new Map<string, { threadName: string; updatedAt: number }>();
    try {
        const raw = await readFile(indexPath, 'utf8');
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            const row = JSON.parse(line);
            out.set(row.id, {
                threadName: typeof row.thread_name === 'string' ? row.thread_name : row.id,
                updatedAt: Date.parse(row.updated_at ?? '') || 0,
            });
        }
    } catch {}
    return out;
}
```

- [ ] **Step 4: Fill in summary parsing for one matching file**

```ts
async function readSummaryFromFile(
    file: string,
    selectedDir: string,
    indexById: Map<string, { threadName: string; updatedAt: number }>,
    importedThreadIds: Set<string>,
): Promise<CodexProjectSessionSummary | null> {
    const raw = await readFile(file, 'utf8');
    let threadId: string | null = null;
    let cwd: string | null = null;
    let previewText: string | undefined;

    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        if (row.type === 'session_meta') {
            threadId = typeof row.payload?.id === 'string' ? row.payload.id : null;
            cwd = typeof row.payload?.cwd === 'string' ? resolve(row.payload.cwd) : null;
        }
        if (!previewText && row.type === 'response_item' && row.payload?.type === 'message' && row.payload?.role === 'user') {
            const block = Array.isArray(row.payload?.content) ? row.payload.content.find((item: any) => item?.type === 'input_text') : null;
            if (typeof block?.text === 'string' && block.text.trim().length > 0) {
                previewText = block.text.trim();
            }
        }
    }

    if (!threadId || !cwd || cwd !== selectedDir || importedThreadIds.has(threadId)) {
        return null;
    }

    const indexed = indexById.get(threadId);
    return {
        codexThreadId: threadId,
        title: indexed?.threadName || previewText || threadId,
        updatedAt: indexed?.updatedAt || 0,
        ...(previewText ? { previewText } : {}),
    };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest packages/happy-cli/src/codex/listProjectSessions.test.ts`

Expected: PASS with 2 tests passed.

### Task 2: Machine RPC for listing external Codex sessions

**Files:**
- Modify: `packages/happy-cli/src/api/apiMachine.ts`
- Modify: `packages/happy-cli/src/api/apiMachine.codexFork.test.ts`

- [ ] **Step 1: Write the failing API machine RPC test**

```ts
it('lists external Codex project sessions', async () => {
    const { listProjectSessions } = await import('@/codex/listProjectSessions');
    vi.mocked(listProjectSessions).mockResolvedValue([
        { codexThreadId: 'thread-1', title: 'Fix sidebar', updatedAt: 1718506800000, previewText: 'Fix sidebar' },
    ]);

    const { ApiMachineClient } = await import('./apiMachine');
    const client = new ApiMachineClient('token', machineClient());
    client.setRPCHandlers({
        spawnSession: vi.fn(),
        stopSession: vi.fn(),
        requestShutdown: vi.fn(),
    });

    const result = await handlersFrom(client).get('machine-1:codex-list-project-sessions')?.({
        directory: '/repo/app',
        importedThreadIds: ['thread-9'],
    });

    expect(result).toEqual({
        type: 'success',
        sessions: [
            { codexThreadId: 'thread-1', title: 'Fix sidebar', updatedAt: 1718506800000, previewText: 'Fix sidebar' },
        ],
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest packages/happy-cli/src/api/apiMachine.codexFork.test.ts`

Expected: FAIL because the `codex-list-project-sessions` handler is not registered.

- [ ] **Step 3: Add the RPC registration**

```ts
import { listProjectSessions } from '@/codex/listProjectSessions';

this.rpcHandlerManager.registerHandler('codex-list-project-sessions', async (params: any) => {
    const directory = requireNonEmptyString(params?.directory, 'directory');
    const importedThreadIds = Array.isArray(params?.importedThreadIds)
        ? new Set(params.importedThreadIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0))
        : new Set<string>();

    const sessions = await listProjectSessions({
        directory,
        importedThreadIds,
    });

    return {
        type: 'success',
        sessions,
    };
});
```

- [ ] **Step 4: Add the mock and imports in the test file**

```ts
const { codexClientMethods, listProjectSessions } = vi.hoisted(() => ({
    codexClientMethods: {
        connect: vi.fn(),
        disconnect: vi.fn(),
        forkThread: vi.fn(),
        readThread: vi.fn(),
        rollbackThread: vi.fn(),
        injectItems: vi.fn(),
    },
    listProjectSessions: vi.fn(),
}));

vi.mock('@/codex/listProjectSessions', () => ({
    listProjectSessions,
}));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest packages/happy-cli/src/api/apiMachine.codexFork.test.ts`

Expected: PASS with the new RPC test and existing Codex fork RPC tests all green.

### Task 3: App-side typed RPC helper

**Files:**
- Modify: `packages/happy-app/sources/sync/ops.ts`
- Modify: `packages/happy-app/sources/sync/ops.codexFork.test.ts`

- [ ] **Step 1: Write the failing app-side helper test**

```ts
it('lists external Codex project sessions through machine RPC', async () => {
    machineRPC.mockResolvedValue({
        type: 'success',
        sessions: [
            { codexThreadId: 'thread-1', title: 'Fix sidebar', updatedAt: 1718506800000, previewText: 'Fix sidebar' },
        ],
    });

    const { listCodexProjectSessions } = await import('./ops');
    const result = await listCodexProjectSessions({
        machineId: 'machine-1',
        directory: '/tmp/project',
        importedThreadIds: ['thread-2'],
    });

    expect(result).toEqual({
        type: 'success',
        sessions: [
            { codexThreadId: 'thread-1', title: 'Fix sidebar', updatedAt: 1718506800000, previewText: 'Fix sidebar' },
        ],
    });
    expect(machineRPC).toHaveBeenCalledWith(
        'machine-1',
        'codex-list-project-sessions',
        { directory: '/tmp/project', importedThreadIds: ['thread-2'] },
    );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest packages/happy-app/sources/sync/ops.codexFork.test.ts`

Expected: FAIL because `listCodexProjectSessions` does not exist yet.

- [ ] **Step 3: Add the new helper and result types**

```ts
export interface CodexProjectSessionSummary {
    codexThreadId: string;
    title: string;
    updatedAt: number;
    previewText?: string;
}

export type CodexListProjectSessionsResult =
    | { type: 'success'; sessions: CodexProjectSessionSummary[] }
    | { type: 'error'; errorMessage: string };

export async function listCodexProjectSessions(options: {
    machineId: string;
    directory: string;
    importedThreadIds: string[];
}): Promise<CodexListProjectSessionsResult> {
    const { machineId, directory, importedThreadIds } = options;
    try {
        return await apiSocket.machineRPC<
            CodexListProjectSessionsResult,
            { directory: string; importedThreadIds: string[] }
        >(
            machineId,
            'codex-list-project-sessions',
            { directory, importedThreadIds },
        );
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to list Codex project sessions',
        };
    }
}
```

- [ ] **Step 4: Keep import on the existing spawn helper**

```ts
// No new import RPC helper is needed.
// The /new screen will reuse machineSpawnNewSession({
//   machineId,
//   directory,
//   agent: 'codex',
//   resumeCodexThreadId: selected.codexThreadId,
// })
// so runCodex.ts can replay the thread through HAPPY_FORK_CODEX_THREAD_ID.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest packages/happy-app/sources/sync/ops.codexFork.test.ts`

Expected: PASS with the new helper test and existing fork/duplicate tests still green.

### Task 4: Pure UI helper for external-session section state

**Files:**
- Create: `packages/happy-app/sources/utils/externalCodexSessions.ts`
- Create: `packages/happy-app/sources/utils/externalCodexSessions.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildExternalCodexSectionState } from './externalCodexSessions';

describe('buildExternalCodexSectionState', () => {
    it('disables refresh when machine is offline', () => {
        expect(buildExternalCodexSectionState({
            selectedMachineId: 'machine-1',
            isMachineOnline: false,
            resolvedSelectedPath: '/tmp/project',
            importedThreadIds: [],
            sessions: [],
        }).canRefresh).toBe(false);
    });

    it('marks matching imported sessions by codexThreadId', () => {
        const state = buildExternalCodexSectionState({
            selectedMachineId: 'machine-1',
            isMachineOnline: true,
            resolvedSelectedPath: '/tmp/project',
            importedThreadIds: ['thread-1'],
            sessions: [
                { codexThreadId: 'thread-1', title: 'Imported', updatedAt: 1 },
                { codexThreadId: 'thread-2', title: 'External', updatedAt: 2 },
            ],
        });

        expect(state.visibleSessions.map((item) => item.codexThreadId)).toEqual(['thread-2']);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest packages/happy-app/sources/utils/externalCodexSessions.test.ts`

Expected: FAIL because the helper file does not exist yet.

- [ ] **Step 3: Add the pure helper**

```ts
import type { CodexProjectSessionSummary } from '@/sync/ops';

export function buildExternalCodexSectionState(opts: {
    selectedMachineId: string | null;
    isMachineOnline: boolean;
    resolvedSelectedPath: string | null;
    importedThreadIds: string[];
    sessions: CodexProjectSessionSummary[];
}) {
    const canRefresh = Boolean(
        opts.selectedMachineId &&
        opts.isMachineOnline &&
        opts.resolvedSelectedPath,
    );
    const imported = new Set(opts.importedThreadIds);
    const visibleSessions = opts.sessions.filter((session) => !imported.has(session.codexThreadId));

    return {
        canRefresh,
        visibleSessions,
    };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest packages/happy-app/sources/utils/externalCodexSessions.test.ts`

Expected: PASS with both helper tests green.

### Task 5: `/new` screen UI and import-on-click flow

**Files:**
- Modify: `packages/happy-app/sources/app/(app)/new/index.tsx`
- Test: `packages/happy-app/sources/sync/ops.codexFork.test.ts`
- Test: `packages/happy-app/sources/utils/externalCodexSessions.test.ts`

- [ ] **Step 1: Add the failing UI-facing state usage in `/new`**

```ts
import {
    listCodexProjectSessions,
    type CodexProjectSessionSummary,
} from '@/sync/ops';
import { buildExternalCodexSectionState } from '@/utils/externalCodexSessions';

const [externalCodexSessions, setExternalCodexSessions] = React.useState<CodexProjectSessionSummary[]>([]);
const [isRefreshingExternalCodex, setIsRefreshingExternalCodex] = React.useState(false);
const [importingCodexThreadId, setImportingCodexThreadId] = React.useState<string | null>(null);
```

- [ ] **Step 2: Add the refresh callback**

```ts
const importedThreadIds = React.useMemo(() => {
    if (!sessions || !selectedMachineId) return [];
    return sessions.flatMap((item) => {
        if (typeof item === 'string') return [];
        const session = item as Session;
        if (session.metadata?.machineId !== selectedMachineId) return [];
        return session.metadata?.codexThreadId ? [session.metadata.codexThreadId] : [];
    });
}, [selectedMachineId, sessions]);

const externalCodexSection = React.useMemo(() => buildExternalCodexSectionState({
    selectedMachineId,
    isMachineOnline: !!selectedMachine && isMachineOnline(selectedMachine),
    resolvedSelectedPath,
    importedThreadIds,
    sessions: externalCodexSessions,
}), [selectedMachine, selectedMachineId, resolvedSelectedPath, importedThreadIds, externalCodexSessions]);

const refreshExternalCodexSessions = React.useCallback(async () => {
    if (!selectedMachineId || !resolvedSelectedPath) return;
    setIsRefreshingExternalCodex(true);
    try {
        const result = await listCodexProjectSessions({
            machineId: selectedMachineId,
            directory: resolvedSelectedPath,
            importedThreadIds,
        });
        if (result.type === 'success') {
            setExternalCodexSessions(result.sessions);
            return;
        }
        Modal.alert(t('common.error'), result.errorMessage);
    } finally {
        setIsRefreshingExternalCodex(false);
    }
}, [selectedMachineId, resolvedSelectedPath, importedThreadIds]);
```

- [ ] **Step 3: Add the click-to-import callback**

```ts
const importExternalCodexSession = React.useCallback(async (session: CodexProjectSessionSummary) => {
    if (!selectedMachineId || !resolvedSelectedPath) return;
    setImportingCodexThreadId(session.codexThreadId);
    try {
        const result = await machineSpawnNewSession({
            machineId: selectedMachineId,
            directory: resolvedSelectedPath,
            agent: 'codex',
            resumeCodexThreadId: session.codexThreadId,
        });
        if (result.type !== 'success') {
            const message = result.type === 'error'
                ? result.errorMessage
                : `The directory '${resolvedSelectedPath}' does not exist yet.`;
            Modal.alert(t('common.error'), message);
            return;
        }

        await sync.refreshSessions();
        navigateToSession(result.sessionId);
    } finally {
        setImportingCodexThreadId(null);
    }
}, [navigateToSession, resolvedSelectedPath, selectedMachineId]);
```

- [ ] **Step 4: Render the refresh button and external list**

```tsx
<View style={styles.externalCodexSection}>
    <View style={styles.externalCodexHeader}>
        <Text style={styles.externalCodexTitle}>External Codex sessions</Text>
        <Pressable
            disabled={!externalCodexSection.canRefresh || isRefreshingExternalCodex}
            onPress={() => void refreshExternalCodexSessions()}
            style={({ pressed }) => [
                styles.externalCodexRefreshButton,
                pressed && styles.configRowPressed,
                (!externalCodexSection.canRefresh || isRefreshingExternalCodex) && styles.externalCodexRefreshButtonDisabled,
            ]}
        >
            {isRefreshingExternalCodex ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
                <Ionicons name="refresh" size={14} color={theme.colors.textSecondary} />
            )}
        </Pressable>
    </View>

    {externalCodexSection.visibleSessions.map((session) => (
        <Pressable
            key={session.codexThreadId}
            onPress={() => void importExternalCodexSession(session)}
            style={({ pressed }) => [
                styles.externalCodexRow,
                pressed && styles.configRowPressed,
            ]}
        >
            <View style={styles.externalCodexBadge}>
                <Text style={styles.externalCodexBadgeText}>Codex</Text>
            </View>
            <View style={styles.externalCodexBody}>
                <Text numberOfLines={1} style={styles.externalCodexRowTitle}>{session.title}</Text>
                <Text numberOfLines={1} style={styles.externalCodexRowSubtitle}>
                    {session.previewText ?? session.codexThreadId}
                </Text>
            </View>
            {importingCodexThreadId === session.codexThreadId ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
                <Ionicons name="chevron-forward" size={14} color={theme.colors.textSecondary} />
            )}
        </Pressable>
    ))}
</View>
```

- [ ] **Step 5: Run focused tests and verify the UI build stays green**

Run: `pnpm vitest packages/happy-cli/src/codex/listProjectSessions.test.ts packages/happy-cli/src/api/apiMachine.codexFork.test.ts packages/happy-app/sources/sync/ops.codexFork.test.ts packages/happy-app/sources/utils/externalCodexSessions.test.ts`

Expected: PASS with all new focused tests green.

Run: `pnpm --filter happy-app test -- --runInBand`

Expected: PASS if the package exposes a scoped test script; if not, record the missing script and run the nearest working Vitest command for touched files only.

Run: `pnpm lint`

Expected: PASS, or if the repo does not support root lint in this environment, capture the exact failing command and stop before claiming completion.

## Self-Review

- Spec coverage:
  - refresh button: Task 5
  - external Codex scan by current project: Tasks 1 and 2
  - marked list in `/new`: Task 5
  - click to import into Happy and open detail: Tasks 3 and 5
  - duplicate/imported-thread filtering: Tasks 1 and 4

- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to above” placeholders remain.

- Type consistency:
  - Summary type uses `CodexProjectSessionSummary` end-to-end in CLI helper, app helper, and `/new` screen.
  - Import path intentionally reuses existing `machineSpawnNewSession({ resumeCodexThreadId })` instead of inventing a second import transport.

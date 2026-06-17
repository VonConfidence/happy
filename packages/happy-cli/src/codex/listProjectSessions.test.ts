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

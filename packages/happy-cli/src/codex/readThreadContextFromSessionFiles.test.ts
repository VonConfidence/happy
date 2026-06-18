import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readThreadContextFromSessionFiles } from './readThreadContextFromSessionFiles';

describe('readThreadContextFromSessionFiles', () => {
    let codexHome: string;

    beforeEach(async () => {
        codexHome = await mkdtemp(join(os.tmpdir(), 'codex-home-'));
        await mkdir(join(codexHome, 'sessions', '2026', '06', '17'), { recursive: true });
        vi.stubEnv('CODEX_HOME', codexHome);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('reads the first turn_context payload for a thread id', async () => {
        await writeFile(
            join(codexHome, 'sessions', '2026', '06', '17', 'rollout.jsonl'),
            [
                JSON.stringify({ type: 'session_meta', payload: { id: 'thread-1', cwd: '/repo/app' } }),
                JSON.stringify({
                    type: 'turn_context',
                    payload: {
                        turn_id: 'turn-1',
                        cwd: '/repo/app',
                        current_date: '2026-06-17',
                        timezone: 'Asia/Shanghai',
                        approval_policy: 'never',
                        sandbox_policy: { type: 'danger-full-access' },
                        model: 'gpt-5.4',
                        effort: 'medium',
                    },
                }),
            ].join('\n') + '\n',
        );

        await expect(readThreadContextFromSessionFiles('thread-1')).resolves.toEqual({
            cwd: '/repo/app',
            currentDate: '2026-06-17',
            timezone: 'Asia/Shanghai',
            approvalPolicy: 'never',
            sandboxPolicy: { type: 'danger-full-access' },
            model: 'gpt-5.4',
            reasoningEffort: 'medium',
        });
    });

    it('returns null when the thread has no turn_context payload', async () => {
        await writeFile(
            join(codexHome, 'sessions', '2026', '06', '17', 'rollout.jsonl'),
            JSON.stringify({ type: 'session_meta', payload: { id: 'thread-1', cwd: '/repo/app' } }) + '\n',
        );

        await expect(readThreadContextFromSessionFiles('thread-1')).resolves.toBeNull();
    });
});

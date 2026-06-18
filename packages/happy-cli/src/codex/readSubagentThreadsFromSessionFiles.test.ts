import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isCuid } from '@paralleldrive/cuid2';

import { readSubagentThreadsFromSessionFiles } from './readSubagentThreadsFromSessionFiles';

describe('readSubagentThreadsFromSessionFiles', () => {
    let codexHome: string;

    beforeEach(async () => {
        codexHome = await mkdtemp(join(os.tmpdir(), 'codex-home-'));
        await mkdir(join(codexHome, 'sessions', '2026', '06', '18'), { recursive: true });
        vi.stubEnv('CODEX_HOME', codexHome);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('reads subagent session files for a parent thread and maps them to sidechain envelopes', async () => {
        await writeFile(
            join(codexHome, 'sessions', '2026', '06', '18', 'subagent.jsonl'),
            [
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:00.000Z',
                    type: 'session_meta',
                    payload: {
                        id: 'child-thread-1',
                        source: {
                            subagent: {
                                thread_spawn: {
                                    parent_thread_id: 'parent-thread-1',
                                },
                            },
                        },
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:01.000Z',
                    type: 'event_msg',
                    payload: { type: 'task_started' },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:02.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'message',
                        role: 'user',
                        content: [{ type: 'input_text', text: 'Inspect auth flow' }],
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:03.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Starting investigation' }],
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:04.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'function_call',
                        name: 'exec_command',
                        call_id: 'call-1',
                        arguments: JSON.stringify({ cmd: 'rg auth src' }),
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:05.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'function_call_output',
                        call_id: 'call-1',
                        output: 'found matches',
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:06.000Z',
                    type: 'event_msg',
                    payload: { type: 'task_complete' },
                }),
            ].join('\n') + '\n',
        );

        const result = await readSubagentThreadsFromSessionFiles('parent-thread-1');
        expect(result).toHaveLength(1);
        expect(result[0].threadId).toBe('child-thread-1');
        expect(result[0].parentThreadId).toBe('parent-thread-1');
        expect(result[0].prompt).toBe('Inspect auth flow');
        expect(isCuid(result[0].sessionSubagent)).toBe(true);
        expect(result[0].envelopes.map((envelope) => envelope.ev.t)).toEqual([
            'turn-start',
            'text',
            'tool-call-start',
            'tool-call-end',
            'turn-end',
        ]);
        expect(result[0].envelopes.every((envelope) => envelope.subagent === result[0].sessionSubagent)).toBe(true);
        expect(result[0].envelopes[2]).toMatchObject({
            ev: {
                t: 'tool-call-start',
                call: 'call-1',
                name: 'exec_command',
                args: { cmd: 'rg auth src' },
            },
        });
    });

    it('ignores child threads for other parent thread ids', async () => {
        await writeFile(
            join(codexHome, 'sessions', '2026', '06', '18', 'subagent.jsonl'),
            JSON.stringify({
                timestamp: '2026-06-18T10:00:00.000Z',
                type: 'session_meta',
                payload: {
                    id: 'child-thread-1',
                    source: {
                        subagent: {
                            thread_spawn: {
                                parent_thread_id: 'different-parent',
                            },
                        },
                    },
                },
            }) + '\n',
        );

        await expect(readSubagentThreadsFromSessionFiles('parent-thread-1')).resolves.toEqual([]);
    });
});

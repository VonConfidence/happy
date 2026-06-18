import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readMainThreadToolCallsFromSessionFiles } from './readMainThreadToolCallsFromSessionFiles';

describe('readMainThreadToolCallsFromSessionFiles', () => {
    let codexHome: string;

    beforeEach(async () => {
        codexHome = await mkdtemp(join(os.tmpdir(), 'codex-home-'));
        await mkdir(join(codexHome, 'sessions', '2026', '06', '18'), { recursive: true });
        vi.stubEnv('CODEX_HOME', codexHome);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('reads main-thread exec_command and apply_patch tool calls from session files', async () => {
        await writeFile(
            join(codexHome, 'sessions', '2026', '06', '18', 'main.jsonl'),
            [
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:00.000Z',
                    type: 'session_meta',
                    payload: { id: 'thread-1' },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:01.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'function_call',
                        name: 'exec_command',
                        call_id: 'call-1',
                        arguments: JSON.stringify({ cmd: 'sed -n \'1,20p\' AGENTS.md' }),
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:02.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'function_call_output',
                        call_id: 'call-1',
                        output: 'file contents',
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:03.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'custom_tool_call',
                        name: 'apply_patch',
                        call_id: 'call-2',
                        status: 'completed',
                        input: [
                            '*** Begin Patch',
                            '*** Update File: AGENTS.md',
                            '+new line',
                            '*** End Patch',
                        ].join('\n'),
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-06-18T10:00:04.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'function_call',
                        name: 'write_stdin',
                        call_id: 'call-3',
                        arguments: JSON.stringify({ session_id: 1 }),
                    },
                }),
            ].join('\n') + '\n',
        );

        const result = await readMainThreadToolCallsFromSessionFiles('thread-1');
        expect(result.map((envelope) => envelope.ev.t)).toEqual([
            'tool-call-start',
            'tool-call-end',
            'tool-call-start',
            'tool-call-end',
        ]);
        expect(result[0]).toMatchObject({
            ev: {
                t: 'tool-call-start',
                call: 'call-1',
                name: 'CodexBash',
                args: { cmd: 'sed -n \'1,20p\' AGENTS.md' },
            },
        });
        expect(result[2]).toMatchObject({
            ev: {
                t: 'tool-call-start',
                call: 'call-2',
                name: 'CodexPatch',
                description: 'Apply patch to 1 file',
            },
        });
    });

    it('returns an empty list when no matching session file exists', async () => {
        await expect(readMainThreadToolCallsFromSessionFiles('missing-thread')).resolves.toEqual([]);
    });
});

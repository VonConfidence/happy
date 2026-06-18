import { describe, expect, it } from 'vitest';
import { createId, isCuid } from '@paralleldrive/cuid2';
import {
    getCodexThreadSummaryText,
    mapCodexMcpMessageToSessionEnvelopes,
    mapCodexProcessorMessageToSessionEnvelopes,
    mapCodexThreadToSessionEnvelopes,
} from '../utils/sessionProtocolMapper';

describe('mapCodexMcpMessageToSessionEnvelopes', () => {
    it('starts and ends turns for task lifecycle events', () => {
        const started = mapCodexMcpMessageToSessionEnvelopes({ type: 'task_started' }, { currentTurnId: null });

        expect(started.envelopes).toHaveLength(1);
        expect(started.envelopes[0].ev.t).toBe('turn-start');
        expect(started.envelopes[0].turn).toBe(started.currentTurnId);
        expect(started.envelopes[0].turn).not.toBe(started.envelopes[0].id);

        const ended = mapCodexMcpMessageToSessionEnvelopes({ type: 'task_complete' }, { currentTurnId: started.currentTurnId });
        expect(ended.envelopes).toHaveLength(1);
        expect(ended.envelopes[0].ev.t).toBe('turn-end');
        if (ended.envelopes[0].ev.t === 'turn-end') {
            expect(ended.envelopes[0].ev.status).toBe('completed');
        }
        expect(ended.envelopes[0].turn).toBe(started.currentTurnId);
        expect(ended.currentTurnId).toBeNull();
    });

    it('maps abort lifecycle with cancelled turn-end status', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'turn_aborted' },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(1);
        expect(result.envelopes[0].ev).toEqual({
            t: 'turn-end',
            status: 'cancelled',
        });
        expect(result.currentTurnId).toBeNull();
    });

    it('maps agent text messages with turn context', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'agent_message', message: 'hello' },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(1);
        expect(result.envelopes[0].turn).toBe('turn-1');
        expect(result.envelopes[0].ev).toEqual({ t: 'text', text: 'hello' });
    });

    it('maps parent call linkage to subagent field', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'agent_message', message: 'subagent hello', parent_call_id: 'parent-call-1' },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(2);
        const subagent = result.envelopes[1].subagent;
        expect(typeof subagent).toBe('string');
        expect(isCuid(subagent!)).toBe(true);
        expect(result.envelopes[0]).toMatchObject({
            subagent,
            ev: { t: 'start' },
        });
        expect(subagent).not.toBe('parent-call-1');
    });

    it('emits stop for active subagents before turn-end', () => {
        const subagent = createId();
        const activeSubagents = new Set<string>([subagent]);
        const startedSubagents = new Set<string>([subagent]);
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'task_complete' },
            { currentTurnId: 'turn-1', activeSubagents, startedSubagents }
        );

        expect(result.envelopes).toHaveLength(2);
        expect(result.envelopes[0]).toMatchObject({
            subagent,
            ev: { t: 'stop' },
        });
        expect(result.envelopes[1].ev).toEqual({
            t: 'turn-end',
            status: 'completed',
        });
    });

    it('maps exec command begin to tool-call-start', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            {
                type: 'exec_command_begin',
                call_id: 'call-1',
                command: 'ls -la',
                cwd: '/tmp',
            },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(1);
        const envelope = result.envelopes[0];
        expect(envelope.ev.t).toBe('tool-call-start');
        if (envelope.ev.t === 'tool-call-start') {
            expect(envelope.ev.call).toBe('call-1');
            expect(envelope.ev.name).toBe('CodexBash');
            expect(envelope.ev.title).toContain('Run `ls -la`');
            expect(envelope.ev.args).toEqual({ command: 'ls -la', cwd: '/tmp' });
        }
    });

    it('skips token_count messages', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'token_count', total_tokens: 10 },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(0);
        expect(result.currentTurnId).toBe('turn-1');
    });
});

describe('mapCodexProcessorMessageToSessionEnvelopes', () => {
    it('maps reasoning tool lifecycle to start/text/end session events', () => {
        const startEvents = mapCodexProcessorMessageToSessionEnvelopes({
            type: 'tool-call',
            callId: 'reasoning-1',
            name: 'CodexReasoning',
            input: { title: 'Plan changes' },
            id: 'legacy-id-1',
        }, { currentTurnId: 'turn-1' });

        expect(startEvents).toHaveLength(1);
        expect(startEvents[0].ev.t).toBe('tool-call-start');

        const endEvents = mapCodexProcessorMessageToSessionEnvelopes({
            type: 'tool-call-result',
            callId: 'reasoning-1',
            output: { content: 'Step 1, Step 2', status: 'completed' },
            id: 'legacy-id-2',
        }, { currentTurnId: 'turn-1' });

        expect(endEvents).toHaveLength(2);
        expect(endEvents[0].ev.t).toBe('text');
        if (endEvents[0].ev.t === 'text') {
            expect(endEvents[0].ev.thinking).toBe(true);
        }
        expect(endEvents[1].ev).toEqual({ t: 'tool-call-end', call: 'reasoning-1' });
    });

    it('maps reasoning text to thinking text event', () => {
        const events = mapCodexProcessorMessageToSessionEnvelopes({
            type: 'reasoning',
            message: 'Working through options',
            id: 'legacy-id-3',
        }, { currentTurnId: 'turn-1' });

        expect(events).toHaveLength(1);
        expect(events[0].ev).toEqual({
            t: 'text',
            text: 'Working through options',
            thinking: true,
        });
    });
});

describe('mapCodexThreadToSessionEnvelopes', () => {
    it('derives the imported session title from thread name and falls back to preview text', () => {
        expect(getCodexThreadSummaryText({
            id: 'thread-1',
            name: 'Keep my title',
            preview: 'preview text',
            turns: [],
        })).toBe('Keep my title');

        expect(getCodexThreadSummaryText({
            id: 'thread-2',
            name: '   ',
            preview: '\n  First preview line  \nSecond line',
            turns: [],
        })).toBe('First preview line');
    });

    it('backfills Codex thread turns as session envelopes with codex item ids', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                completedAt: 101,
                status: 'completed',
                items: [
                    { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'hello codex' }] },
                    { id: 'agent-1', type: 'agentMessage', text: 'hello human' },
                ],
            }],
        });

        expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
            'turn-start',
            'text',
            'text',
            'turn-end',
        ]);
        expect(envelopes[1]).toMatchObject({
            role: 'user',
            id: 'user-1',
            codexItemId: 'user-1',
            ev: { t: 'text', text: 'hello codex' },
        });
        expect(envelopes[2]).toMatchObject({
            role: 'agent',
            id: 'agent-1',
            turn: 'turn-1',
            codexItemId: 'agent-1',
            ev: { t: 'text', text: 'hello human' },
        });
    });

    it('preserves intra-turn message ordering with distinct synthetic timestamps', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                completedAt: 100,
                status: 'completed',
                items: [
                    { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'first user' }] },
                    { id: 'user-2', type: 'userMessage', content: [{ type: 'text', text: 'second user' }] },
                    { id: 'cmd-1', type: 'commandExecution', command: 'pwd', status: 'completed' },
                    { id: 'agent-1', type: 'agentMessage', text: 'final answer' },
                ],
            }],
        });

        const timeline = envelopes.map((envelope) => ({
            id: envelope.id,
            time: envelope.time,
            type: envelope.ev.t,
        }));

        expect(timeline.map((entry) => entry.id)).toEqual([
            'turn-1:start',
            'user-1',
            'user-2',
            'cmd-1:start',
            'cmd-1:end',
            'agent-1',
            'turn-1:end',
        ]);
        expect(new Set(timeline.map((entry) => entry.time)).size).toBe(timeline.length);
        expect(timeline.every((entry, index) => index === 0 || entry.time > timeline[index - 1]!.time)).toBe(true);
    });

    it('keeps user image inputs in the historical transcript summary text', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                completedAt: 101,
                status: 'completed',
                items: [
                    {
                        id: 'user-1',
                        type: 'userMessage',
                        content: [
                            { type: 'text', text: 'inspect this' },
                            { type: 'image', url: 'https://example.com/image.png' },
                            { type: 'localImage', path: '/tmp/local.png' },
                        ],
                    },
                ],
            }],
        });

        expect(envelopes[1]).toMatchObject({
            role: 'user',
            id: 'user-1',
            ev: {
                t: 'text',
                text: 'inspect this\n[Image: https://example.com/image.png]\n[Local image: /tmp/local.png]',
            },
        });
    });

    it('backfills Codex command execution items as tool calls', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                items: [
                    {
                        id: 'cmd-1',
                        type: 'commandExecution',
                        command: 'pnpm test',
                        cwd: '/tmp/project',
                        aggregatedOutput: 'ok',
                        exitCode: 0,
                        durationMs: 25,
                        status: 'completed',
                    },
                ],
            }],
        });

        expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
            'turn-start',
            'tool-call-start',
            'tool-call-end',
            'turn-end',
        ]);
        expect(envelopes[1]).toMatchObject({
            role: 'agent',
            turn: 'turn-1',
            ev: { t: 'tool-call-start', call: 'cmd-1', name: 'CodexBash' },
        });
        expect(envelopes[2]).toMatchObject({
            role: 'agent',
            turn: 'turn-1',
            ev: {
                t: 'tool-call-end',
                call: 'cmd-1',
                output: 'ok',
                status: 'completed',
                exitCode: 0,
                durationMs: 25,
            },
        });
    });

    it('normalizes historical file changes so codex patch stats can render', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                items: [
                    {
                        id: 'patch-1',
                        type: 'fileChange',
                        status: 'completed',
                        changes: [
                            {
                                path: 'src/a.ts',
                                kind: { type: 'update', move_path: null },
                                diff: '@@ -1 +1 @@\n-old\n+new\n',
                            },
                            {
                                path: 'src/b.ts',
                                type: 'add',
                                content: 'export const b = 1;\n',
                            },
                        ],
                    },
                ],
            }],
        });

        expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
            'turn-start',
            'tool-call-start',
            'tool-call-end',
            'turn-end',
        ]);
        expect(envelopes[1]).toMatchObject({
            role: 'agent',
            turn: 'turn-1',
            ev: {
                t: 'tool-call-start',
                call: 'patch-1',
                name: 'CodexPatch',
                args: {
                    changes: {
                        'src/a.ts': {
                            diff: '@@ -1 +1 @@\n-old\n+new\n',
                            unified_diff: '@@ -1 +1 @@\n-old\n+new\n',
                            kind: { type: 'update', move_path: null },
                        },
                        'src/b.ts': {
                            add: { content: 'export const b = 1;\n' },
                            kind: { type: 'add', move_path: null },
                        },
                    },
                    fileChanges: {
                        'src/a.ts': {
                            diff: '@@ -1 +1 @@\n-old\n+new\n',
                            unified_diff: '@@ -1 +1 @@\n-old\n+new\n',
                            kind: { type: 'update', move_path: null },
                        },
                        'src/b.ts': {
                            add: { content: 'export const b = 1;\n' },
                            kind: { type: 'add', move_path: null },
                        },
                    },
                    status: 'completed',
                },
            },
        });
    });

    it('backfills web search items as tool calls instead of dropping them', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                items: [
                    {
                        id: 'search-1',
                        type: 'webSearch',
                        query: 'vitest mock png',
                        action: { type: 'search', query: 'vitest mock png' },
                    },
                ],
            }],
        });

        expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
            'turn-start',
            'tool-call-start',
            'tool-call-end',
            'turn-end',
        ]);
        expect(envelopes[1]).toMatchObject({
            role: 'agent',
            turn: 'turn-1',
            ev: {
                t: 'tool-call-start',
                call: 'search-1',
                name: 'WebSearch',
                args: {
                    query: 'vitest mock png',
                    action: { type: 'search', query: 'vitest mock png' },
                },
            },
        });
    });

    it('keeps reasoning text when summary and content include structured blocks', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                items: [
                    {
                        id: 'reason-1',
                        type: 'reasoning',
                        summary: [{ text: 'Summarize findings' }],
                        content: ['Inspect code', { text: 'Check thread mapper' }],
                    },
                ],
            }],
        });

        expect(envelopes[1]).toMatchObject({
            role: 'agent',
            turn: 'turn-1',
            ev: {
                t: 'text',
                text: 'Summarize findings\nInspect code\nCheck thread mapper',
                thinking: true,
            },
        });
    });

    it('injects sessionSubagent into historical Agent tool calls so child replay can nest', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                items: [
                    {
                        id: 'agent-tool-item-1',
                        type: 'functionCall',
                        name: 'Agent',
                        arguments: {
                            description: 'Inspect translations',
                            prompt: 'Review all translation files',
                        },
                        status: 'completed',
                        output: 'done',
                    },
                ],
            }],
        }, {
            historicalSubagents: [{
                prompt: 'Review all translation files',
                sessionSubagent: createId(),
            }],
        });

        expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
            'turn-start',
            'tool-call-start',
            'tool-call-end',
            'turn-end',
        ]);
        expect(envelopes[1]).toMatchObject({
            role: 'agent',
            turn: 'turn-1',
            ev: {
                t: 'tool-call-start',
                call: 'agent-tool-item-1',
                name: 'Agent',
                args: expect.objectContaining({
                    description: 'Inspect translations',
                    prompt: 'Review all translation files',
                    sessionSubagent: expect.any(String),
                }),
            },
        });

        if (envelopes[1].ev.t === 'tool-call-start') {
            expect(isCuid(String(envelopes[1].ev.args.sessionSubagent))).toBe(true);
        }
    });
});

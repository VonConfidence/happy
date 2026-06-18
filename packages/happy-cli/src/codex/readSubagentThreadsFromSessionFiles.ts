import os from 'node:os';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createId } from '@paralleldrive/cuid2';
import { createEnvelope, type CreateEnvelopeOptions, type SessionEnvelope } from '@slopus/happy-wire';

export type CodexHistoricalSubagentThread = {
    threadId: string;
    parentThreadId: string;
    sessionSubagent: string;
    prompt: string | null;
    envelopes: SessionEnvelope[];
};

type SessionMetaPayload = {
    id?: string;
    source?: {
        subagent?: {
            thread_spawn?: {
                parent_thread_id?: string;
            };
        };
    };
};

type ResponseMessagePayload = {
    type?: string;
    role?: string;
    content?: Array<{
        type?: string;
        text?: string;
    }>;
    phase?: string | null;
};

type FunctionCallPayload = {
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
};

type FunctionCallOutputPayload = {
    type?: string;
    call_id?: string;
    output?: string;
};

async function collectJsonlFiles(directory: string, output: string[]): Promise<void> {
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(directory, entry.name);
            if (entry.isDirectory()) {
                await collectJsonlFiles(fullPath, output);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                output.push(fullPath);
            }
        }
    } catch {
        return;
    }
}

function parseTimestampMs(value: unknown): number {
    if (typeof value !== 'string') {
        return Date.now();
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
}

function extractText(content: unknown): string | null {
    if (!Array.isArray(content)) {
        return null;
    }

    const text = content
        .flatMap((item) => {
            if (!item || typeof item !== 'object') {
                return [];
            }
            const record = item as { text?: unknown };
            return typeof record.text === 'string' && record.text.trim().length > 0
                ? [record.text]
                : [];
        })
        .join('\n')
        .trim();

    return text.length > 0 ? text : null;
}

function parseArguments(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function titleForFunctionCall(name: string, args: Record<string, unknown>): string {
    const description = typeof args.description === 'string' && args.description.trim().length > 0
        ? args.description.trim()
        : null;
    const title = typeof args.title === 'string' && args.title.trim().length > 0
        ? args.title.trim()
        : null;
    const prompt = typeof args.prompt === 'string' && args.prompt.trim().length > 0
        ? args.prompt.trim()
        : null;

    return description ?? title ?? prompt ?? name;
}

function ensureTurn(turnId: string | null, subagent: string, time: number, envelopes: SessionEnvelope[]): string {
    if (turnId) {
        return turnId;
    }

    const created = createId();
    const opts = { turn: created, subagent, time, id: `${created}:start` } satisfies CreateEnvelopeOptions;
    envelopes.push(createEnvelope('agent', { t: 'turn-start' }, opts));
    return created;
}

export async function readSubagentThreadsFromSessionFiles(parentThreadId: string): Promise<CodexHistoricalSubagentThread[]> {
    const codexHome = resolve(process.env.CODEX_HOME ?? join(os.homedir(), '.codex'));
    const files: string[] = [];
    await collectJsonlFiles(join(codexHome, 'sessions'), files);

    const results: CodexHistoricalSubagentThread[] = [];

    for (const file of files) {
        let raw: string;
        try {
            raw = await readFile(file, 'utf8');
        } catch {
            continue;
        }

        const rows = raw.split('\n').filter((line) => line.trim().length > 0);
        if (rows.length === 0) {
            continue;
        }

        let threadId: string | null = null;
        let matchedParentThreadId: string | null = null;
        for (const line of rows) {
            let row: any;
            try {
                row = JSON.parse(line);
            } catch {
                continue;
            }

            if (row?.type !== 'session_meta') {
                continue;
            }

            const payload = row.payload as SessionMetaPayload | undefined;
            threadId = typeof payload?.id === 'string' ? payload.id : null;
            matchedParentThreadId = payload?.source?.subagent?.thread_spawn?.parent_thread_id ?? null;
            break;
        }

        if (!threadId || matchedParentThreadId !== parentThreadId) {
            continue;
        }

        const sessionSubagent = createId();
        const envelopes: SessionEnvelope[] = [];
        let currentTurnId: string | null = null;
        let prompt: string | null = null;

        for (const line of rows) {
            let row: any;
            try {
                row = JSON.parse(line);
            } catch {
                continue;
            }

            const time = parseTimestampMs(row?.timestamp);
            if (row?.type === 'event_msg') {
                const payload = row.payload as { type?: string; status?: string } | undefined;
                if (payload?.type === 'task_started') {
                    currentTurnId = currentTurnId ?? createId();
                    envelopes.push(createEnvelope('agent', { t: 'turn-start' }, {
                        turn: currentTurnId,
                        subagent: sessionSubagent,
                        time,
                        id: `${threadId}:${currentTurnId}:start`,
                    }));
                    continue;
                }

                if (payload?.type === 'task_complete' || payload?.type === 'turn_aborted') {
                    if (!currentTurnId) {
                        continue;
                    }

                    const status = payload.type === 'turn_aborted'
                        ? 'cancelled'
                        : (payload.status === 'failed' ? 'failed' : 'completed');
                    envelopes.push(createEnvelope('agent', { t: 'turn-end', status }, {
                        turn: currentTurnId,
                        subagent: sessionSubagent,
                        time,
                        id: `${threadId}:${currentTurnId}:end`,
                    }));
                    currentTurnId = null;
                }
                continue;
            }

            if (row?.type !== 'response_item') {
                continue;
            }

            const payload = row.payload;
            if (payload?.type === 'message') {
                const message = payload as ResponseMessagePayload;
                const text = extractText(message.content);
                if (message.role === 'user' && !prompt) {
                    prompt = text;
                    continue;
                }
                if (message.role !== 'assistant' || !text) {
                    continue;
                }

                currentTurnId = ensureTurn(currentTurnId, sessionSubagent, time, envelopes);
                envelopes.push(createEnvelope('agent', { t: 'text', text }, {
                    turn: currentTurnId,
                    subagent: sessionSubagent,
                    time,
                }));
                continue;
            }

            if (payload?.type === 'function_call') {
                const call = payload as FunctionCallPayload;
                const name = typeof call.name === 'string' && call.name.length > 0 ? call.name : 'unknown';
                const callId = typeof call.call_id === 'string' && call.call_id.length > 0 ? call.call_id : createId();
                const args = parseArguments(call.arguments);
                currentTurnId = ensureTurn(currentTurnId, sessionSubagent, time, envelopes);
                envelopes.push(createEnvelope('agent', {
                    t: 'tool-call-start',
                    call: callId,
                    name,
                    title: titleForFunctionCall(name, args),
                    description: titleForFunctionCall(name, args),
                    args,
                }, {
                    turn: currentTurnId,
                    subagent: sessionSubagent,
                    time,
                }));
                continue;
            }

            if (payload?.type === 'function_call_output') {
                const call = payload as FunctionCallOutputPayload;
                const callId = typeof call.call_id === 'string' && call.call_id.length > 0 ? call.call_id : createId();
                currentTurnId = ensureTurn(currentTurnId, sessionSubagent, time, envelopes);
                envelopes.push(createEnvelope('agent', {
                    t: 'tool-call-end',
                    call: callId,
                    output: typeof call.output === 'string' ? call.output : null,
                }, {
                    turn: currentTurnId,
                    subagent: sessionSubagent,
                    time,
                }));
            }
        }

        if (currentTurnId) {
            envelopes.push(createEnvelope('agent', { t: 'turn-end', status: 'completed' }, {
                turn: currentTurnId,
                subagent: sessionSubagent,
                time: envelopes[envelopes.length - 1]?.time ?? Date.now(),
                id: `${threadId}:${currentTurnId}:end:fallback`,
            }));
        }

        results.push({
            threadId,
            parentThreadId,
            sessionSubagent,
            prompt,
            envelopes,
        });
    }

    return results.sort((a, b) => {
        const left = a.envelopes[0]?.time ?? 0;
        const right = b.envelopes[0]?.time ?? 0;
        return left - right;
    });
}

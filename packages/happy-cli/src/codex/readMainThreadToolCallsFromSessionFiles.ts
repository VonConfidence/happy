import os from 'node:os';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createEnvelope, type SessionEnvelope } from '@slopus/happy-wire';

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

type CustomToolCallPayload = {
    type?: string;
    name?: string;
    call_id?: string;
    status?: string;
    input?: string;
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

function summarizeCommand(command: unknown): string | null {
    if (typeof command === 'string' && command.trim().length > 0) {
        return command.trim();
    }
    if (Array.isArray(command)) {
        const merged = command.map((value) => String(value)).join(' ').trim();
        return merged.length > 0 ? merged : null;
    }
    return null;
}

function commandToTitle(command: string | null): string {
    if (!command) {
        return 'Run command';
    }
    const short = command.length > 80 ? `${command.slice(0, 77)}...` : command;
    return `Run \`${short}\``;
}

function countPatchedFiles(input: string): number {
    const matches = input.match(/^\*\*\* (?:Add|Update|Delete) File:/gm);
    return matches?.length ?? 0;
}

function patchDescription(input: string): string {
    const fileCount = countPatchedFiles(input);
    if (fileCount <= 0) {
        return 'Apply patch';
    }
    if (fileCount === 1) {
        return 'Apply patch to 1 file';
    }
    return `Apply patch to ${fileCount} files`;
}

export async function readMainThreadToolCallsFromSessionFiles(threadId: string): Promise<SessionEnvelope[]> {
    const codexHome = resolve(process.env.CODEX_HOME ?? join(os.homedir(), '.codex'));
    const files: string[] = [];
    await collectJsonlFiles(join(codexHome, 'sessions'), files);

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

        let matched = false;
        for (const line of rows) {
            let row: any;
            try {
                row = JSON.parse(line);
            } catch {
                continue;
            }
            if (row?.type === 'session_meta' && row.payload?.id === threadId) {
                matched = true;
                break;
            }
        }

        if (!matched) {
            continue;
        }

        const envelopes: SessionEnvelope[] = [];
        for (const line of rows) {
            let row: any;
            try {
                row = JSON.parse(line);
            } catch {
                continue;
            }

            if (row?.type !== 'response_item') {
                continue;
            }

            const time = parseTimestampMs(row?.timestamp);
            const payload = row.payload;
            if (payload?.type === 'function_call' && payload?.name === 'exec_command') {
                const call = payload as FunctionCallPayload;
                const callId = typeof call.call_id === 'string' && call.call_id.length > 0 ? call.call_id : null;
                if (!callId) {
                    continue;
                }
                const args = parseArguments(call.arguments);
                const command = summarizeCommand(args.cmd ?? args.command);
                envelopes.push(createEnvelope('agent', {
                    t: 'tool-call-start',
                    call: callId,
                    name: 'CodexBash',
                    title: commandToTitle(command),
                    description: command ?? 'Execute command',
                    args,
                }, {
                    id: `${callId}:start`,
                    time,
                }));
                continue;
            }

            if (payload?.type === 'function_call_output') {
                const call = payload as FunctionCallOutputPayload;
                const callId = typeof call.call_id === 'string' && call.call_id.length > 0 ? call.call_id : null;
                if (!callId) {
                    continue;
                }
                envelopes.push(createEnvelope('agent', {
                    t: 'tool-call-end',
                    call: callId,
                    output: typeof call.output === 'string' ? call.output : null,
                }, {
                    id: `${callId}:end`,
                    time,
                }));
                continue;
            }

            if (payload?.type === 'custom_tool_call' && payload?.name === 'apply_patch') {
                const call = payload as CustomToolCallPayload;
                const callId = typeof call.call_id === 'string' && call.call_id.length > 0 ? call.call_id : null;
                const input = typeof call.input === 'string' ? call.input : '';
                if (!callId || input.length === 0) {
                    continue;
                }

                envelopes.push(createEnvelope('agent', {
                    t: 'tool-call-start',
                    call: callId,
                    name: 'CodexPatch',
                    title: 'Apply patch',
                    description: patchDescription(input),
                    args: { patch: input },
                }, {
                    id: `${callId}:start`,
                    time,
                }));
                envelopes.push(createEnvelope('agent', {
                    t: 'tool-call-end',
                    call: callId,
                    isError: call.status === 'failed',
                    status: typeof call.status === 'string' ? call.status : null,
                }, {
                    id: `${callId}:end`,
                    time,
                }));
            }
        }

        return envelopes.sort((a, b) => a.time - b.time);
    }

    return [];
}

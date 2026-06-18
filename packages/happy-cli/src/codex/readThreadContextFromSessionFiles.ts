import os from 'node:os';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type CodexTurnContextMetadata = {
    cwd?: string;
    currentDate?: string;
    timezone?: string;
    approvalPolicy?: string;
    sandboxPolicy?: unknown;
    model?: string;
    reasoningEffort?: string;
};

type SessionMetaPayload = {
    id?: string;
};

type TurnContextPayload = {
    cwd?: string;
    current_date?: string;
    timezone?: string;
    approval_policy?: string;
    sandbox_policy?: unknown;
    model?: string;
    effort?: string;
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

function normalizeContext(payload: TurnContextPayload): CodexTurnContextMetadata | null {
    const context: CodexTurnContextMetadata = {
        ...(typeof payload.cwd === 'string' ? { cwd: payload.cwd } : {}),
        ...(typeof payload.current_date === 'string' ? { currentDate: payload.current_date } : {}),
        ...(typeof payload.timezone === 'string' ? { timezone: payload.timezone } : {}),
        ...(typeof payload.approval_policy === 'string' ? { approvalPolicy: payload.approval_policy } : {}),
        ...(payload.sandbox_policy !== undefined ? { sandboxPolicy: payload.sandbox_policy } : {}),
        ...(typeof payload.model === 'string' ? { model: payload.model } : {}),
        ...(typeof payload.effort === 'string' ? { reasoningEffort: payload.effort } : {}),
    };

    return Object.keys(context).length > 0 ? context : null;
}

export async function readThreadContextFromSessionFiles(threadId: string): Promise<CodexTurnContextMetadata | null> {
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

        let matchesThread = false;
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;

            let row: any;
            try {
                row = JSON.parse(line);
            } catch {
                continue;
            }

            if (!matchesThread && row?.type === 'session_meta') {
                const payload = row.payload as SessionMetaPayload | undefined;
                matchesThread = payload?.id === threadId;
                continue;
            }

            if (matchesThread && row?.type === 'turn_context') {
                return normalizeContext((row.payload ?? {}) as TurnContextPayload);
            }
        }
    }

    return null;
}

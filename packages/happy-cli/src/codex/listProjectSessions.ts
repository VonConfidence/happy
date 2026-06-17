import os from 'node:os';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface CodexProjectSessionSummary {
    codexThreadId: string;
    title: string;
    updatedAt: number;
    previewText?: string;
}

type SessionIndexEntry = {
    threadName: string;
    updatedAt: number;
};

export async function listProjectSessions(opts: {
    directory: string;
    importedThreadIds: Set<string>;
}): Promise<CodexProjectSessionSummary[]> {
    const codexHome = resolve(process.env.CODEX_HOME ?? join(os.homedir(), '.codex'));
    const selectedDir = resolve(opts.directory);
    const indexById = await readIndex(join(codexHome, 'session_index.jsonl'));
    const files = await collectCandidateFiles(codexHome);
    const summaries = new Map<string, CodexProjectSessionSummary>();

    for (const file of files) {
        const summary = await readSummaryFromFile(file, selectedDir, indexById, opts.importedThreadIds);
        if (!summary) continue;

        const existing = summaries.get(summary.codexThreadId);
        if (!existing || existing.updatedAt < summary.updatedAt) {
            summaries.set(summary.codexThreadId, summary);
        }
    }

    return Array.from(summaries.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function readIndex(indexPath: string): Promise<Map<string, SessionIndexEntry>> {
    const out = new Map<string, SessionIndexEntry>();

    try {
        const raw = await readFile(indexPath, 'utf8');
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            const row = JSON.parse(line) as {
                id?: string;
                thread_name?: string;
                updated_at?: string;
            };
            if (typeof row.id !== 'string' || row.id.length === 0) continue;

            out.set(row.id, {
                threadName: typeof row.thread_name === 'string' && row.thread_name.trim().length > 0
                    ? row.thread_name.trim()
                    : row.id,
                updatedAt: typeof row.updated_at === 'string' ? (Date.parse(row.updated_at) || 0) : 0,
            });
        }
    } catch {
        return out;
    }

    return out;
}

async function collectCandidateFiles(codexHome: string): Promise<string[]> {
    const files: string[] = [];
    await collectJsonlFiles(join(codexHome, 'sessions'), true, files);
    await collectJsonlFiles(join(codexHome, 'archived_sessions'), false, files);
    return files;
}

async function collectJsonlFiles(directory: string, recursive: boolean, output: string[]): Promise<void> {
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (recursive) {
                    await collectJsonlFiles(fullPath, true, output);
                }
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

async function readSummaryFromFile(
    file: string,
    selectedDir: string,
    indexById: Map<string, SessionIndexEntry>,
    importedThreadIds: Set<string>,
): Promise<CodexProjectSessionSummary | null> {
    let raw: string;
    try {
        raw = await readFile(file, 'utf8');
    } catch {
        return null;
    }

    let threadId: string | null = null;
    let cwd: string | null = null;
    let previewText: string | undefined;

    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;

        let row: any;
        try {
            row = JSON.parse(line);
        } catch {
            continue;
        }

        if (row?.type === 'session_meta') {
            threadId = typeof row.payload?.id === 'string' ? row.payload.id : threadId;
            cwd = typeof row.payload?.cwd === 'string' ? resolve(row.payload.cwd) : cwd;
            continue;
        }

        if (!previewText && row?.type === 'response_item' && row.payload?.type === 'message' && row.payload?.role === 'user') {
            const content = Array.isArray(row.payload?.content) ? row.payload.content : [];
            const inputTextBlock = content.find((item: any) => item?.type === 'input_text' && typeof item?.text === 'string');
            if (typeof inputTextBlock?.text === 'string' && inputTextBlock.text.trim().length > 0) {
                previewText = inputTextBlock.text.trim();
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

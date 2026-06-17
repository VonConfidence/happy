import os from 'node:os';
import { readdir, readFile, stat } from 'node:fs/promises';
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

type SessionMetaPayload = {
    id?: string;
    cwd?: string;
    source?: unknown;
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
    let fileUpdatedAt = 0;
    try {
        raw = await readFile(file, 'utf8');
        const stats = await stat(file);
        fileUpdatedAt = Number.isFinite(stats.mtimeMs) ? stats.mtimeMs : 0;
    } catch {
        return null;
    }

    let threadId: string | null = null;
    let cwd: string | null = null;
    let sessionSource: unknown;
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
            const payload = row.payload as SessionMetaPayload | undefined;
            threadId = typeof payload?.id === 'string' ? payload.id : threadId;
            cwd = typeof payload?.cwd === 'string' ? resolve(payload.cwd) : cwd;
            sessionSource = payload?.source;
            continue;
        }

        if (!previewText && row?.type === 'response_item' && row.payload?.type === 'message' && row.payload?.role === 'user') {
            const extractedPreview = extractMeaningfulUserPreview(row.payload?.content);
            if (extractedPreview) {
                previewText = extractedPreview;
            }
        }
    }

    if (!threadId || !cwd || cwd !== selectedDir || importedThreadIds.has(threadId)) {
        return null;
    }

    if (isSubagentThread(sessionSource)) {
        return null;
    }

    const indexed = indexById.get(threadId);
    if (!indexed) {
        return null;
    }

    return {
        codexThreadId: threadId,
        title: indexed.threadName || previewText || threadId,
        updatedAt: indexed.updatedAt || fileUpdatedAt,
        ...(previewText ? { previewText } : {}),
    };
}

function isSubagentThread(source: unknown): boolean {
    return Boolean(
        source
        && typeof source === 'object'
        && !Array.isArray(source)
        && (source as { subagent?: unknown }).subagent,
    );
}

function extractMeaningfulUserPreview(content: unknown): string | undefined {
    if (!Array.isArray(content)) {
        return undefined;
    }

    for (const item of content) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue;
        }
        if ((item as { type?: unknown }).type !== 'input_text') {
            continue;
        }

        const text = typeof (item as { text?: unknown }).text === 'string'
            ? (item as { text: string }).text
            : '';
        const cleaned = normalizeUserPreviewText(text);
        if (cleaned) {
            return cleaned;
        }
    }

    return undefined;
}

function normalizeUserPreviewText(text: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed) {
        return undefined;
    }

    if (trimmed.startsWith('# AGENTS.md instructions')) {
        return undefined;
    }
    if (trimmed.startsWith('<environment_context>')) {
        return undefined;
    }

    const withoutTitleInstruction = trimmed.replace(
        /\n*\s*Based on this message, call functions\.happy__change_title[\s\S]*$/u,
        '',
    ).trim();
    if (!withoutTitleInstruction) {
        return undefined;
    }

    const firstNonEmptyLine = withoutTitleInstruction
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);

    return firstNonEmptyLine || undefined;
}

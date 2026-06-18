import { ToolCall } from '@/sync/typesMessage';
import { stringifyToolCommand } from './toolCommand';
import { getDiffStats, getPatchDiffStats } from '@/components/diff/calculateDiff';

const TERMINAL_TOOL_NAMES = new Set([
    'Bash',
    'CodexBash',
    'GeminiBash',
    'shell',
    'execute',
]);

const EDIT_TOOL_NAMES = new Set([
    'Edit',
    'MultiEdit',
    'Write',
    'CodexPatch',
    'GeminiPatch',
    'edit',
    'NotebookEdit',
]);

const READ_TOOL_NAMES = new Set([
    'Read',
    'read',
    'NotebookRead',
    'LS',
]);

const SEARCH_TOOL_NAMES = new Set([
    'Grep',
    'Glob',
    'search',
    'WebSearch',
]);

const WEB_TOOL_NAMES = new Set([
    'WebFetch',
]);

const TASK_TOOL_NAMES = new Set([
    'Task',
    'Agent',
]);

const SINGLE_FILE_EDIT_TOOL_NAMES = new Set([
    'Edit',
    'MultiEdit',
    'Write',
    'NotebookEdit',
    'file-edit',
    'edit',
]);

export type ToolSummaryCategory = 'terminal' | 'edit' | 'read' | 'search' | 'web' | 'task' | 'other';
export type ToolEditedFileChange = {
    path: string;
    additions: number;
    deletions: number;
};

export function isTerminalToolName(name: string): boolean {
    return TERMINAL_TOOL_NAMES.has(name);
}

export function shouldRenderToolCardHeader(toolName: string, platformOS: string): boolean {
    return !(platformOS === 'web' && toolName === 'CodexPatch');
}

export function getToolSummaryCategory(toolName: string): ToolSummaryCategory {
    if (TERMINAL_TOOL_NAMES.has(toolName)) {
        return 'terminal';
    }
    if (EDIT_TOOL_NAMES.has(toolName)) {
        return 'edit';
    }
    if (READ_TOOL_NAMES.has(toolName)) {
        return 'read';
    }
    if (SEARCH_TOOL_NAMES.has(toolName)) {
        return 'search';
    }
    if (WEB_TOOL_NAMES.has(toolName)) {
        return 'web';
    }
    if (TASK_TOOL_NAMES.has(toolName)) {
        return 'task';
    }
    return 'other';
}

export function getToolSummaryDetail(tool: Pick<ToolCall, 'name' | 'input' | 'description'>): string | null {
    const terminalCommand = getTerminalToolCommand(tool);
    if (terminalCommand) {
        return terminalCommand;
    }

    const editedFiles = getToolEditedFiles(tool);
    if (editedFiles.length > 0) {
        if (editedFiles.length === 1) {
            return editedFiles[0];
        }
        return `${editedFiles[0]} +${editedFiles.length - 1}`;
    }

    const filePath = tool.input?.file_path;
    if (typeof filePath === 'string' && filePath.trim().length > 0) {
        return filePath.trim();
    }

    const path = tool.input?.path;
    if (typeof path === 'string' && path.trim().length > 0) {
        return path.trim();
    }

    const pattern = tool.input?.pattern;
    if (typeof pattern === 'string' && pattern.trim().length > 0) {
        return pattern.trim();
    }

    const url = tool.input?.url;
    if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim();
    }

    return tool.description?.trim() || null;
}

export function getTerminalToolCommand(tool: Pick<ToolCall, 'name' | 'input'>): string | null {
    if (!isTerminalToolName(tool.name)) {
        return null;
    }

    const parsedCmd = tool.input?.parsed_cmd;
    if (Array.isArray(parsedCmd) && parsedCmd.length > 0) {
        const cmd = parsedCmd.find((item) => typeof item?.cmd === 'string' && item.cmd.trim().length > 0)?.cmd;
        if (cmd) {
            return cmd.trim();
        }
    }

    const directCommand = stringifyToolCommand(tool.input?.command);
    if (directCommand) {
        return directCommand;
    }

    const title = tool.input?.toolCall?.title;
    if (typeof title === 'string') {
        const bracketIdx = title.indexOf(' [');
        const command = bracketIdx > 0 ? title.substring(0, bracketIdx) : title;
        const trimmed = command.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return null;
}

export function getToolEditedFiles(tool: Pick<ToolCall, 'name' | 'input'>): string[] {
    return getToolEditedFileChanges(tool).map((change) => change.path);
}

export function getToolEditedFileChanges(tool: Pick<ToolCall, 'name' | 'input'>): ToolEditedFileChange[] {
    if (SINGLE_FILE_EDIT_TOOL_NAMES.has(tool.name)) {
        const filePath = getSingleFileEditPath(tool);
        if (filePath && filePath.trim().length > 0) {
            return [{
                path: filePath.trim(),
                ...getSingleFileEditStats(tool),
            }];
        }
    }

    if (EDIT_TOOL_NAMES.has(tool.name)) {
        return getPatchFileChanges(tool.input);
    }

    return [];
}

function getSingleFileEditPath(tool: Pick<ToolCall, 'name' | 'input'>): string | null {
    if (typeof tool.input?.file_path === 'string') {
        return tool.input.file_path;
    }
    if (typeof tool.input?.filePath === 'string') {
        return tool.input.filePath;
    }
    if (typeof tool.input?.notebook_path === 'string') {
        return tool.input.notebook_path;
    }
    return null;
}

function getSingleFileEditStats(tool: Pick<ToolCall, 'name' | 'input'>): { additions: number; deletions: number } {
    if (tool.name === 'Edit' || tool.name === 'edit') {
        if (typeof tool.input?.old_string === 'string' && typeof tool.input?.new_string === 'string') {
            return getDiffStats(tool.input.old_string, tool.input.new_string);
        }
    }

    if (tool.name === 'MultiEdit') {
        const edits = Array.isArray(tool.input?.edits)
            ? tool.input.edits as Array<{ old_string?: unknown; new_string?: unknown }>
            : [];
        return edits.reduce(
            (acc: { additions: number; deletions: number }, edit) => {
                if (typeof edit?.old_string !== 'string' || typeof edit?.new_string !== 'string') {
                    return acc;
                }
                const stats = getDiffStats(edit.old_string, edit.new_string);
                acc.additions += stats.additions;
                acc.deletions += stats.deletions;
                return acc;
            },
            { additions: 0, deletions: 0 },
        );
    }

    if (tool.name === 'Write') {
        const content = typeof tool.input?.content === 'string' ? tool.input.content : '';
        return {
            additions: content === '' ? 0 : content.split('\n').length,
            deletions: 0,
        };
    }

    if (tool.name === 'NotebookEdit') {
        const newSource = typeof tool.input?.new_source === 'string' ? tool.input.new_source : '';
        const editMode = typeof tool.input?.edit_mode === 'string' ? tool.input.edit_mode : 'replace';
        if (editMode === 'delete') {
            return { additions: 0, deletions: newSource === '' ? 1 : newSource.split('\n').length };
        }
        return {
            additions: newSource === '' ? 0 : newSource.split('\n').length,
            deletions: 0,
        };
    }

    return { additions: 0, deletions: 0 };
}

export function getPatchFiles(input: any): string[] {
    return getPatchFileChanges(input).map((change) => change.path);
}

function getPatchFileChanges(input: any): ToolEditedFileChange[] {
    if (input?.changes && typeof input.changes === 'object' && !Array.isArray(input.changes)) {
        return getStructuredPatchFileChanges(input.changes);
    }
    if (input?.fileChanges && typeof input.fileChanges === 'object' && !Array.isArray(input.fileChanges)) {
        return getStructuredPatchFileChanges(input.fileChanges);
    }
    if (Array.isArray(input?.changes)) {
        return getStructuredPatchFileChangesFromArray(input.changes);
    }
    if (Array.isArray(input?.fileChanges)) {
        return getStructuredPatchFileChangesFromArray(input.fileChanges);
    }
    if (typeof input?.patch === 'string') {
        return getPatchFileChangesFromApplyPatchInput(input.patch);
    }
    return [];
}

function getStructuredPatchFileChanges(
    changes: Record<string, unknown>,
): ToolEditedFileChange[] {
    return uniqueFileChanges(
        Object.entries(changes).map(([path, change]) => {
            const normalizedPath = path.trim();
            if (!normalizedPath) {
                return null;
            }
            return {
                path: normalizedPath,
                ...getStructuredPatchStats(change),
            };
        }).filter((change): change is ToolEditedFileChange => change !== null),
    );
}

function getStructuredPatchFileChangesFromArray(changes: unknown[]): ToolEditedFileChange[] {
    return uniqueFileChanges(changes.map((change) => {
        if (!change || typeof change !== 'object' || Array.isArray(change)) {
            return null;
        }
        const path = (change as { path?: unknown }).path;
        if (typeof path !== 'string' || path.trim().length === 0) {
            return null;
        }
        return {
            path: path.trim(),
            ...getStructuredPatchStats(change),
        };
    }).filter((change): change is ToolEditedFileChange => change !== null));
}

function getStructuredPatchStats(change: unknown): { additions: number; deletions: number } {
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
        return { additions: 0, deletions: 0 };
    }

    const record = change as Record<string, unknown>;
    if (typeof record.diff === 'string') {
        return getPatchDiffStats(record.diff);
    }
    if (typeof record.unified_diff === 'string') {
        return getPatchDiffStats(record.unified_diff);
    }

    const modify = record.modify;
    if (modify && typeof modify === 'object' && !Array.isArray(modify)) {
        const oldText = typeof (modify as { old_content?: unknown }).old_content === 'string'
            ? (modify as { old_content: string }).old_content
            : '';
        const newText = typeof (modify as { new_content?: unknown }).new_content === 'string'
            ? (modify as { new_content: string }).new_content
            : '';
        return getDiffStats(oldText, newText);
    }

    const add = record.add;
    if (add && typeof add === 'object' && !Array.isArray(add)) {
        const content = typeof (add as { content?: unknown }).content === 'string'
            ? (add as { content: string }).content
            : '';
        return { additions: content === '' ? 0 : content.split('\n').length, deletions: 0 };
    }

    const del = record.delete;
    if (del && typeof del === 'object' && !Array.isArray(del)) {
        const content = typeof (del as { content?: unknown }).content === 'string'
            ? (del as { content: string }).content
            : '';
        return { additions: 0, deletions: content === '' ? 0 : content.split('\n').length };
    }

    return { additions: 0, deletions: 0 };
}

function getPatchFileChangesFromApplyPatchInput(patch: string): ToolEditedFileChange[] {
    const changes: ToolEditedFileChange[] = [];
    let current: ToolEditedFileChange | null = null;

    for (const line of patch.split('\n')) {
        const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
        if (match) {
            if (current) {
                changes.push(current);
            }
            current = {
                path: match[1].trim(),
                additions: 0,
                deletions: 0,
            };
            continue;
        }
        if (!current) {
            continue;
        }
        if (line.startsWith('*** End Patch') || line.startsWith('*** Move to: ') || line.startsWith('@@')) {
            continue;
        }
        if (line.startsWith('+')) {
            current.additions += 1;
            continue;
        }
        if (line.startsWith('-')) {
            current.deletions += 1;
        }
    }

    if (current) {
        changes.push(current);
    }

    return uniqueFileChanges(changes);
}

function uniqueFileChanges(changes: ToolEditedFileChange[]): ToolEditedFileChange[] {
    const merged = new Map<string, ToolEditedFileChange>();
    for (const change of changes) {
        const normalized = change.path.trim();
        if (!normalized) {
            continue;
        }
        const existing = merged.get(normalized);
        if (existing) {
            existing.additions += change.additions;
            existing.deletions += change.deletions;
            continue;
        }
        merged.set(normalized, {
            path: normalized,
            additions: change.additions,
            deletions: change.deletions,
        });
    }
    return Array.from(merged.values());
}

function uniquePaths(paths: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const path of paths) {
        const normalized = path.trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        unique.push(normalized);
    }
    return unique;
}

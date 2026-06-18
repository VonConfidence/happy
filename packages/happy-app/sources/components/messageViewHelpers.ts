import { Metadata } from '@/sync/storageTypes';
import { resolvePath } from '@/utils/pathUtils';

const USER_MESSAGE_COLLAPSE_MAX_LINES = 8;
const USER_MESSAGE_COLLAPSE_MAX_CHARS = 600;

export function getCollapsibleUserMessagePreview(text: string): {
    text: string;
    collapsed: boolean;
} {
    const lines = text.split('\n');
    if (lines.length > USER_MESSAGE_COLLAPSE_MAX_LINES) {
        return {
            text: lines.slice(0, USER_MESSAGE_COLLAPSE_MAX_LINES).join('\n'),
            collapsed: true,
        };
    }

    if (text.length > USER_MESSAGE_COLLAPSE_MAX_CHARS) {
        return {
            text: text.slice(0, USER_MESSAGE_COLLAPSE_MAX_CHARS).trimEnd(),
            collapsed: true,
        };
    }

    return {
        text,
        collapsed: false,
    };
}

export function formatTurnSummaryPath(path: string, metadata: Metadata | null): string {
    return resolvePath(path, metadata);
}

export function normalizeVisibleUserMessageText(text: string): string {
    const requestMarker = 'My request for Codex:';
    const requestIndex = text.indexOf(requestMarker);
    const relevant = requestIndex >= 0
        ? text.slice(requestIndex + requestMarker.length)
        : text;

    const cleaned = relevant
        .split('\n')
        .filter((line) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
                return true;
            }
            if (/^\[Image: .+\]$/.test(trimmed)) {
                return false;
            }
            return true;
        })
        .join('\n')
        .trim();

    return cleaned;
}

import type { Metadata } from './storageTypes';

function pickPreferredString(incoming?: string, existing?: string): string | undefined {
    const next = incoming?.trim();
    if (next) {
        return incoming;
    }
    const prev = existing?.trim();
    return prev ? existing : incoming;
}

export function mergeSessionMetadata(
    existing: Metadata | null,
    incoming: Metadata | null,
    existingVersion: number,
    incomingVersion: number,
): Metadata | null {
    if (!existing) {
        return incoming;
    }
    if (!incoming) {
        return existing;
    }

    if (incomingVersion < existingVersion) {
        return {
            ...incoming,
            ...existing,
            name: pickPreferredString(incoming.name, existing.name),
            summary: incoming.summary ?? existing.summary,
            codexThreadId: incoming.codexThreadId ?? existing.codexThreadId,
            codexTurnContext: incoming.codexTurnContext ?? existing.codexTurnContext,
            importedFromExternalCodex: incoming.importedFromExternalCodex ?? existing.importedFromExternalCodex,
        };
    }

    return {
        ...existing,
        ...incoming,
        name: pickPreferredString(incoming.name, existing.name),
        summary: incoming.summary ?? existing.summary,
        codexThreadId: incoming.codexThreadId ?? existing.codexThreadId,
        codexTurnContext: incoming.codexTurnContext ?? existing.codexTurnContext,
        importedFromExternalCodex: incoming.importedFromExternalCodex ?? existing.importedFromExternalCodex,
    };
}

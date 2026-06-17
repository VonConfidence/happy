import type { CodexProjectSessionSummary } from '@/sync/ops';

export function buildExternalCodexSectionState(opts: {
    selectedMachineId: string | null;
    isMachineOnline: boolean;
    resolvedSelectedPath: string | null;
    importedThreadIds: string[];
    sessions: CodexProjectSessionSummary[];
}) {
    const canRefresh = Boolean(
        opts.selectedMachineId &&
        opts.isMachineOnline &&
        opts.resolvedSelectedPath,
    );
    const imported = new Set(opts.importedThreadIds);
    const visibleSessions = opts.sessions.filter((session) => !imported.has(session.codexThreadId));

    return {
        canRefresh,
        visibleSessions,
    };
}

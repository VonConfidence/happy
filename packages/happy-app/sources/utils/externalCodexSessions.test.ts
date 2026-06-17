import { describe, expect, it } from 'vitest';
import { buildExternalCodexSectionState } from './externalCodexSessions';

describe('buildExternalCodexSectionState', () => {
    it('disables refresh when machine is offline', () => {
        expect(buildExternalCodexSectionState({
            selectedMachineId: 'machine-1',
            isMachineOnline: false,
            resolvedSelectedPath: '/tmp/project',
            importedThreadIds: [],
            sessions: [],
        }).canRefresh).toBe(false);
    });

    it('filters out matching imported sessions by codexThreadId', () => {
        const state = buildExternalCodexSectionState({
            selectedMachineId: 'machine-1',
            isMachineOnline: true,
            resolvedSelectedPath: '/tmp/project',
            importedThreadIds: ['thread-1'],
            sessions: [
                { codexThreadId: 'thread-1', title: 'Imported', updatedAt: 1 },
                { codexThreadId: 'thread-2', title: 'External', updatedAt: 2 },
            ],
        });

        expect(state.visibleSessions.map((item) => item.codexThreadId)).toEqual(['thread-2']);
    });
});

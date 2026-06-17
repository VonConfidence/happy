import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const { useSettingMock } = vi.hoisted(() => ({
    useSettingMock: vi.fn(),
}));

vi.mock('@/sync/storage', () => ({
    useSetting: useSettingMock,
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

import { getSessionName, prefixCodexSessionTitle, useSessionStatus } from './sessionUtils';

describe('useSessionStatus', () => {
    it('shows auto-approving text for codex full mode permission requests', () => {
        useSettingMock.mockReturnValue({});
        const session = {
            id: 'session-1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: 1,
            presence: 'online',
            metadata: { flavor: 'codex', path: '/tmp', host: 'localhost' },
            metadataVersion: 1,
            agentState: {
                requests: {
                    req1: {
                        tool: 'Bash',
                        arguments: {},
                        createdAt: 1,
                    },
                },
            },
            agentStateVersion: 1,
            thinking: false,
            thinkingAt: 1,
            permissionMode: null,
        } as any;

        let captured: ReturnType<typeof useSessionStatus> | null = null;
        const Probe = () => {
            captured = useSessionStatus(session);
            return null;
        };

        act(() => {
            create(React.createElement(Probe));
        });

        const status = captured as ReturnType<typeof useSessionStatus> | null;
        expect(status).not.toBeNull();
        if (!status) {
            throw new Error('Expected session status to be captured');
        }
        expect(status.statusText).toBe('status.autoApprovingPermission');
        expect(status.state).toBe('permission_required');
    });

    it('keeps the standard permission text outside codex full mode', () => {
        useSettingMock.mockReturnValue({});
        const session = {
            id: 'session-2',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: 1,
            presence: 'online',
            metadata: { flavor: 'claude', path: '/tmp', host: 'localhost' },
            metadataVersion: 1,
            agentState: {
                requests: {
                    req1: {
                        tool: 'Bash',
                        arguments: {},
                        createdAt: 1,
                    },
                },
            },
            agentStateVersion: 1,
            thinking: false,
            thinkingAt: 1,
            permissionMode: null,
        } as any;

        let captured: ReturnType<typeof useSessionStatus> | null = null;
        const Probe = () => {
            captured = useSessionStatus(session);
            return null;
        };

        act(() => {
            create(React.createElement(Probe));
        });

        const status = captured as ReturnType<typeof useSessionStatus> | null;
        expect(status).not.toBeNull();
        if (!status) {
            throw new Error('Expected session status to be captured');
        }
        expect(status.statusText).toBe('status.permissionRequired');
    });

    it('prefixes imported codex session titles and falls back to metadata.name', () => {
        expect(getSessionName({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                codexThreadId: 'thread-1',
                importedFromExternalCodex: true,
                name: 'Imported thread title',
            },
        } as any)).toBe('[codex]: Imported thread title');
    });

    it('does not prefix regular codex sessions that were not imported from external refresh', () => {
        expect(getSessionName({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                codexThreadId: 'thread-1',
                name: 'Regular codex session',
            },
        } as any)).toBe('Regular codex session');
    });

    it('does not double-prefix codex titles', () => {
        expect(prefixCodexSessionTitle('[codex]: Imported thread title')).toBe('[codex]: Imported thread title');
    });
});

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

import { useSessionStatus } from './sessionUtils';

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

        expect(captured?.statusText).toBe('status.autoApprovingPermission');
        expect(captured?.state).toBe('permission_required');
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

        expect(captured?.statusText).toBe('status.permissionRequired');
    });
});

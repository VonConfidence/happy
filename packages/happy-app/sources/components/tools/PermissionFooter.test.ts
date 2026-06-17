import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    sessionAllowMock,
    sessionDenyMock,
    useSessionMock,
    useSettingMock,
    updateSessionPermissionModeMock,
    platformMock,
} = vi.hoisted(() => ({
    sessionAllowMock: vi.fn(async () => undefined),
    sessionDenyMock: vi.fn(async () => undefined),
    useSessionMock: vi.fn(),
    useSettingMock: vi.fn(),
    updateSessionPermissionModeMock: vi.fn(),
    platformMock: { OS: 'ios' },
}));

vi.mock('@/sync/ops', () => ({
    sessionAllow: sessionAllowMock,
    sessionDeny: sessionDenyMock,
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => ({
            updateSessionPermissionMode: updateSessionPermissionModeMock,
        }),
    },
    useSession: useSessionMock,
    useSetting: useSettingMock,
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({
        theme: {
            colors: {
                text: '#000',
                textSecondary: '#666',
                radio: { active: '#0a0', dot: '#0a0' },
            },
        },
    }),
    StyleSheet: {
        create: (factory: (theme: any) => any) => factory({
            colors: {
                text: '#000',
                textSecondary: '#666',
                radio: { active: '#0a0', dot: '#0a0' },
            },
        }),
    },
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

vi.mock('react-native', async () => {
    const ReactModule = await import('react');
    const make = (name: string) => ({ children, ...props }: any) => ReactModule.createElement(name, props, children);
    return {
        View: make('View'),
        Text: make('Text'),
        TouchableOpacity: make('TouchableOpacity'),
        ActivityIndicator: make('ActivityIndicator'),
        StyleSheet: {
            create: (styles: any) => styles,
        },
        Platform: platformMock,
    };
});

import { PermissionFooter } from './PermissionFooter';

describe('PermissionFooter', () => {
    beforeEach(() => {
        sessionAllowMock.mockClear();
        sessionDenyMock.mockClear();
        useSessionMock.mockReset();
        useSettingMock.mockReset();
        updateSessionPermissionModeMock.mockClear();
        platformMock.OS = 'ios';
        useSettingMock.mockReturnValue({});
    });

    it('auto-approves codex pending permission for session when session is in full mode', async () => {
        useSessionMock.mockReturnValue({
            id: 'session-1',
            permissionMode: 'full',
        });

        await act(async () => {
            create(React.createElement(PermissionFooter, {
                permission: {
                    id: 'perm-1',
                    status: 'pending',
                },
                sessionId: 'session-1',
                toolName: 'CodexBash',
                toolInput: { command: ['pwd'] },
                metadata: { flavor: 'codex' },
            }));
            await Promise.resolve();
        });

        expect(sessionAllowMock).toHaveBeenCalledWith(
            'session-1',
            'perm-1',
            undefined,
            undefined,
            'approved_for_session',
        );
    });

    it('does not auto-approve codex pending permission when session is not in full mode', async () => {
        useSessionMock.mockReturnValue({
            id: 'session-1',
            permissionMode: 'default',
        });

        await act(async () => {
            create(React.createElement(PermissionFooter, {
                permission: {
                    id: 'perm-1',
                    status: 'pending',
                },
                sessionId: 'session-1',
                toolName: 'CodexBash',
                toolInput: { command: ['pwd'] },
                metadata: { flavor: 'codex' },
            }));
            await Promise.resolve();
        });

        expect(sessionAllowMock).not.toHaveBeenCalled();
    });

    it('auto-approves codex pending permission when effective permission mode resolves to full', async () => {
        useSessionMock.mockReturnValue({
            id: 'session-1',
            permissionMode: null,
            metadata: {
                flavor: 'codex',
            },
        });

        await act(async () => {
            create(React.createElement(PermissionFooter, {
                permission: {
                    id: 'perm-effective-1',
                    status: 'pending',
                },
                sessionId: 'session-1',
                toolName: 'CodexBash',
                toolInput: { command: ['pwd'] },
                metadata: { flavor: 'codex' },
            }));
            await Promise.resolve();
        });

        expect(sessionAllowMock).toHaveBeenCalledWith(
            'session-1',
            'perm-effective-1',
            undefined,
            undefined,
            'approved_for_session',
        );
    });

    it('auto-approves codex pending permission for session on web when session is in full mode', async () => {
        platformMock.OS = 'web';
        useSessionMock.mockReturnValue({
            id: 'session-1',
            permissionMode: 'full',
        });

        let tree: ReturnType<typeof create> | null = null;
        await act(async () => {
            tree = create(React.createElement(PermissionFooter, {
                permission: {
                    id: 'perm-web-1',
                    status: 'pending',
                },
                sessionId: 'session-1',
                toolName: 'CodexPatch',
                toolInput: { changes: {} },
                metadata: { flavor: 'codex' },
            }));
            await Promise.resolve();
        });

        expect(sessionAllowMock).toHaveBeenCalledWith(
            'session-1',
            'perm-web-1',
            undefined,
            undefined,
            'approved_for_session',
        );
        expect(JSON.stringify(tree?.toJSON())).not.toContain('common.yes');
        expect(JSON.stringify(tree?.toJSON())).not.toContain('codex.permissions.yesForSession');
        expect(JSON.stringify(tree?.toJSON())).not.toContain('codex.permissions.stopAndExplain');
    });
});

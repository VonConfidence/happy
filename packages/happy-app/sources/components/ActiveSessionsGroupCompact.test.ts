import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    listCodexProjectSessionsMock,
    machineSpawnNewSessionMock,
    sessionRenameMock,
    refreshSessionsMock,
    navigateToSessionMock,
    useAllMachinesMock,
    useSessionMock,
    useSessionsMock,
    useSessionGitStatusMock,
    applySessionsMock,
    platformMock,
    confirmMock,
    alertMock,
} = vi.hoisted(() => ({
    listCodexProjectSessionsMock: vi.fn(),
    machineSpawnNewSessionMock: vi.fn(),
    sessionRenameMock: vi.fn(),
    refreshSessionsMock: vi.fn(),
    navigateToSessionMock: vi.fn(),
    useAllMachinesMock: vi.fn(),
    useSessionMock: vi.fn(),
    useSessionsMock: vi.fn(),
    useSessionGitStatusMock: vi.fn(),
    applySessionsMock: vi.fn(),
    platformMock: {
        OS: 'web',
        select: (value: Record<string, unknown>) => value.web ?? value.default ?? value.ios,
    },
    confirmMock: vi.fn(),
    alertMock: vi.fn(),
}));

vi.mock('@/sync/ops', () => ({
    listCodexProjectSessions: listCodexProjectSessionsMock,
    machineSpawnNewSession: machineSpawnNewSessionMock,
    sessionRename: sessionRenameMock,
    sessionKill: vi.fn(),
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        refreshSessions: refreshSessionsMock,
    },
}));

vi.mock('@/hooks/useNavigateToSession', () => ({
    useNavigateToSession: () => navigateToSessionMock,
}));

vi.mock('@/sync/storage', () => ({
    useAllMachines: useAllMachinesMock,
    useSession: useSessionMock,
    useSessions: useSessionsMock,
    useSessionGitStatus: useSessionGitStatusMock,
    storage: {
        getState: () => ({
            applySessions: applySessionsMock,
            sessions: {
                'session-1': useSessionMock(),
            },
        }),
    },
}));

vi.mock('@/modal', () => ({
    Modal: {
        confirm: confirmMock,
        alert: alertMock,
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({
        navigate: vi.fn(),
        push: vi.fn(),
    }),
}));

vi.mock('@/hooks/useHappyAction', () => ({
    useHappyAction: (fn: () => Promise<void>) => [false, fn],
}));

vi.mock('@/hooks/useSessionQuickActions', () => ({
    useSessionActionAlert: () => vi.fn(),
}));

vi.mock('@/utils/errors', () => ({
    HappyError: class HappyError extends Error {},
}));

vi.mock('@/utils/worktree', () => ({
    isWorktreePath: () => false,
    getRepoPath: (path: string) => path,
    getWorktreeName: () => null,
}));

vi.mock('@/hooks/useNewSessionDraft', () => ({
    useNewSessionDraft: () => ({
        setMachineId: vi.fn(),
        setPath: vi.fn(),
        setSessionType: vi.fn(),
        setWorktreeKey: vi.fn(),
    }),
}));

vi.mock('./Avatar', () => ({
    Avatar: () => null,
}));

vi.mock('./StatusDot', () => ({
    StatusDot: () => null,
}));

vi.mock('./SessionActionsPopover', () => ({
    SessionActionsPopover: ({ visible, ...props }: any) => (
        visible ? React.createElement('SessionActionsPopover', props) : null
    ),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
    MaterialCommunityIcons: () => null,
}));

vi.mock('expo-image', () => ({
    Image: () => null,
}));

vi.mock('./StyledText', () => ({
    Text: ({ children, ...props }: any) => React.createElement('Text', props, children),
}));

vi.mock('react-native-gesture-handler', () => ({
    Swipeable: ({ children }: any) => React.createElement('Swipeable', {}, children),
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({
        theme: {
            colors: {
                text: '#111',
                textSecondary: '#666',
                divider: '#ddd',
                surface: '#fff',
                surfaceSelected: '#f5f5f5',
                groupped: { background: '#fafafa', sectionTitle: '#999' },
                shadow: { color: '#000', opacity: 0 },
                gitAddedText: '#0a0',
                gitRemovedText: '#c00',
                status: { error: '#f00' },
                button: { primary: { disabled: '#ddd' } },
            },
        },
    }),
    StyleSheet: {
        hairlineWidth: 1,
        create: (factory: (theme: any) => any) => factory({
            colors: {
                text: '#111',
                textSecondary: '#666',
                divider: '#ddd',
                surface: '#fff',
                surfaceSelected: '#f5f5f5',
                groupped: { background: '#fafafa', sectionTitle: '#999' },
                shadow: { color: '#000', opacity: 0 },
                gitAddedText: '#0a0',
                gitRemovedText: '#c00',
                status: { error: '#f00' },
                button: { primary: { disabled: '#ddd' } },
            },
        }),
    },
}));

vi.mock('react-native', async () => {
    const ReactModule = await import('react');
    const make = (name: string) => ({ children, ...props }: any) => ReactModule.createElement(name, props, children);
    return {
        View: make('View'),
        Text: make('Text'),
        Pressable: make('Pressable'),
        TextInput: make('TextInput'),
        ActivityIndicator: make('ActivityIndicator'),
        Platform: platformMock,
    };
});

import { ActiveSessionsGroupCompact } from './ActiveSessionsGroupCompact';

describe('ActiveSessionsGroupCompact external codex sessions', () => {
    const machine = {
        id: 'machine-1',
        active: true,
        activeAt: Date.now(),
        metadata: {
            host: 'mbp',
            displayName: 'My Mac',
            homeDir: '/Users/tester',
        },
    };

    const sessionRow = {
        id: 'session-1',
        name: 'Current happy session',
        subtitle: 'latest',
        avatarId: 'codex',
        flavor: 'codex',
        state: 'waiting' as const,
        hasDraft: false,
        active: true,
        machineId: 'machine-1',
        path: '/Users/tester/work/typera-app',
        homeDir: '/Users/tester',
        completedTodosCount: 0,
        totalTodosCount: 0,
        hasUnread: false,
        createdAt: 100,
    };
    const fullSession = {
        id: 'session-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: 100,
        presence: 'online' as const,
        metadata: {
            machineId: 'machine-1',
            path: '/Users/tester/work/typera-app',
            host: 'mbp',
            homeDir: '/Users/tester',
            name: 'Current happy session',
            summary: {
                text: 'Current happy session',
                updatedAt: 100,
            },
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        draft: null,
        permissionMode: null,
        modelMode: null,
        effortLevel: null,
        todos: [],
        latestUsage: null,
    };

    beforeEach(() => {
        listCodexProjectSessionsMock.mockReset();
        machineSpawnNewSessionMock.mockReset();
        sessionRenameMock.mockReset();
        refreshSessionsMock.mockReset();
        navigateToSessionMock.mockReset();
        useAllMachinesMock.mockReset();
        useSessionMock.mockReset();
        useSessionsMock.mockReset();
        useSessionGitStatusMock.mockReset();
        applySessionsMock.mockReset();
        confirmMock.mockReset();
        alertMock.mockReset();

        useAllMachinesMock.mockReturnValue([machine]);
        useSessionMock.mockReturnValue(fullSession);
        useSessionsMock.mockReturnValue([
            {
                metadata: {
                    machineId: 'machine-1',
                    codexThreadId: 'already-imported',
                },
            },
        ]);
        useSessionGitStatusMock.mockReturnValue({
            branch: 'main',
            unstagedLinesAdded: 346,
            unstagedLinesRemoved: 1,
            lastUpdatedAt: 1,
        });
        listCodexProjectSessionsMock.mockResolvedValue({
            type: 'success',
            sessions: [
                {
                    codexThreadId: 'thread-2',
                    title: 'External Codex Thread',
                    updatedAt: Date.now(),
                    previewText: 'hello from codex',
                },
            ],
        });
        machineSpawnNewSessionMock.mockResolvedValue({
            type: 'success',
            sessionId: 'imported-session-id',
        });
        sessionRenameMock.mockResolvedValue({
            version: 2,
            metadata: {
                ...fullSession.metadata,
                name: 'Renamed session',
                summary: {
                    text: 'Renamed session',
                    updatedAt: 200,
                },
            },
        });
    });

    it('renders a refresh button for the project header on web and shows external codex sessions after refresh', async () => {
        let tree: any;

        await act(async () => {
            tree = create(React.createElement(ActiveSessionsGroupCompact, {
                sessions: [sessionRow],
            }));
        });

        const refreshButton = tree.root.findByProps({
            accessibilityLabel: 'Refresh external Codex sessions for /Users/tester/work/typera-app',
        });

        await act(async () => {
            refreshButton.props.onPress();
            await Promise.resolve();
        });

        expect(listCodexProjectSessionsMock).toHaveBeenCalledWith({
            machineId: 'machine-1',
            directory: '/Users/tester/work/typera-app',
            importedThreadIds: ['already-imported'],
        });

        expect(tree.root.findAllByProps({ children: 'Codex' }).length).toBeGreaterThan(0);
        expect(tree.root.findAllByProps({ children: 'External Codex Thread' }).length).toBeGreaterThan(0);
    });

    it('imports an external codex session into a happy session when clicking the external row', async () => {
        let tree: any;

        await act(async () => {
            tree = create(React.createElement(ActiveSessionsGroupCompact, {
                sessions: [sessionRow],
            }));
        });

        const refreshButton = tree.root.findByProps({
            accessibilityLabel: 'Refresh external Codex sessions for /Users/tester/work/typera-app',
        });

        await act(async () => {
            refreshButton.props.onPress();
            await Promise.resolve();
        });

        const importButton = tree.root.findByProps({
            accessibilityLabel: 'Import external Codex session External Codex Thread',
        });

        await act(async () => {
            importButton.props.onPress();
            await Promise.resolve();
        });

        expect(machineSpawnNewSessionMock).toHaveBeenCalledWith({
            machineId: 'machine-1',
            directory: '/Users/tester/work/typera-app',
            approvedNewDirectoryCreation: false,
            agent: 'codex',
            resumeCodexThreadId: 'thread-2',
        });
        expect(refreshSessionsMock).toHaveBeenCalledTimes(1);
        expect(navigateToSessionMock).toHaveBeenCalledWith('imported-session-id');
    });

    it('renames a session inline after invoking the rename action', async () => {
        let tree: any;

        await act(async () => {
            tree = create(React.createElement(ActiveSessionsGroupCompact, {
                sessions: [sessionRow],
            }));
        });

        const row = tree.root.findAll((node: any) =>
            node.type === 'Pressable' && typeof node.props.onContextMenu === 'function'
        )[0];

        await act(async () => {
            row.props.onContextMenu({
                preventDefault: vi.fn(),
                stopPropagation: vi.fn(),
                nativeEvent: { clientX: 16, clientY: 24 },
            });
        });

        const popover = tree.root.findByType('SessionActionsPopover');

        await act(async () => {
            popover.props.onRename();
        });

        const input = tree.root.findByType('TextInput');

        await act(async () => {
            input.props.onChangeText('Renamed session');
        });

        await act(async () => {
            await input.props.onSubmitEditing();
            await Promise.resolve();
        });

        expect(sessionRenameMock).toHaveBeenCalledWith(fullSession, 'Renamed session');
        expect(applySessionsMock).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'session-1',
                metadataVersion: 2,
                metadata: expect.objectContaining({
                    name: 'Renamed session',
                    summary: expect.objectContaining({
                        text: 'Renamed session',
                    }),
                }),
            }),
        ]);
    });
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/text', () => ({
    t: (key: string, params?: Record<string, unknown>) => {
        if (key === 'tools.taskView.moreTools') {
            return `more:${String(params?.count ?? '')}`;
        }
        return key;
    },
}));

vi.mock('../../tools/knownTools', () => ({
    knownTools: {
        Read: {
            title: 'Read',
        },
        Bash: {
            title: 'Bash',
        },
        Edit: {
            title: 'Edit',
        },
        Task: {
            title: 'Task',
        },
    },
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({
        theme: {
            colors: {
                textSecondary: '#666',
                warning: '#f90',
                success: '#0a0',
                textDestructive: '#f00',
            },
        },
    }),
}));

vi.mock('react-native', async () => {
    const ReactModule = await import('react');
    const make = (name: string) => ({ children, ...props }: any) => ReactModule.createElement(name, props, children);
    return {
        View: make('View'),
        Text: make('Text'),
        ActivityIndicator: make('ActivityIndicator'),
        StyleSheet: {
            create: (styles: any) => styles,
        },
        Platform: { OS: 'ios' },
    };
});

import { TaskView } from './TaskView';
import { Message, ToolCallMessage } from '@/sync/typesMessage';

function toolMessage(
    id: string,
    name: string,
    createdAt: number,
    completedAt: number,
    children: Message[] = [],
): ToolCallMessage {
    return {
        id,
        localId: null,
        createdAt,
        kind: 'tool-call',
        children,
        tool: {
            name,
            state: 'completed',
            input: {},
            createdAt,
            startedAt: createdAt,
            completedAt,
            description: null,
            result: null,
        },
        meta: undefined,
    };
}

describe('TaskView', () => {
    it('orders tool chain by session time so file edits stay at the end', () => {
        const messages: Message[] = [
            toolMessage('edit', 'Edit', 3000, 4000),
            toolMessage('read', 'Read', 1000, 1500),
            toolMessage('bash', 'Bash', 2000, 2500),
        ];

        let tree: ReturnType<typeof create> | null = null;
        act(() => {
            tree = create(React.createElement(TaskView, {
                tool: toolMessage('task', 'Task', 0, 0).tool,
                metadata: null,
                messages,
            }));
        });

        const output = JSON.stringify(tree!.toJSON());
        expect(output.indexOf('Read')).toBeLessThan(output.indexOf('Bash'));
        expect(output.indexOf('Bash')).toBeLessThan(output.indexOf('Edit'));
    });

    it('renders nested child tools as a call chain', () => {
        const child = toolMessage('read', 'Read', 1100, 1200);
        const parent = toolMessage('agent', 'Bash', 1000, 1300, [child]);
        const messages: Message[] = [parent];

        let tree: ReturnType<typeof create> | null = null;
        act(() => {
            tree = create(React.createElement(TaskView, {
                tool: toolMessage('task', 'Task', 0, 0).tool,
                metadata: null,
                messages,
            }));
        });

        const output = JSON.stringify(tree!.toJSON());
        expect(output).toContain('Bash');
        expect(output).toContain('Read');
    });
});

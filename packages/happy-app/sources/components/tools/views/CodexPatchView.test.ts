import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/utils/pathUtils', () => ({
    resolvePath: (value: string) => value,
}));

vi.mock('@/components/diff/calculateDiff', () => ({
    getDiffStats: () => ({ additions: 1, deletions: 1 }),
    getPatchDiffStats: () => ({ additions: 1, deletions: 1 }),
}));

vi.mock('@/utils/codexUnifiedDiff', () => ({
    materializeUnifiedDiffPatch: (patch: string) => patch,
}));

vi.mock('@/components/tools/ToolDiffView', () => ({
    ToolDiffView: (props: any) => React.createElement('ToolDiffView', props),
}));

vi.mock('../ToolSectionView', () => ({
    ToolSectionView: ({ children }: any) => React.createElement('ToolSectionView', {}, children),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
    Octicons: () => null,
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({
        theme: {
            colors: {
                text: '#000',
                textSecondary: '#666',
                surface: '#111',
                surfaceHigh: '#222',
                divider: '#333',
                success: '#0a0',
                warning: '#f90',
            },
        },
    }),
    StyleSheet: {
        create: (factory: (theme: any) => any) => factory({
            colors: {
                text: '#000',
                textSecondary: '#666',
                surface: '#111',
                surfaceHigh: '#222',
                divider: '#333',
                success: '#0a0',
                warning: '#f90',
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
    };
});

import { CodexPatchView } from './CodexPatchView';

describe('CodexPatchView', () => {
    const tool = {
        input: {
            changes: {
                'smokes/block-dnd-p6.verify.mjs': {
                    kind: { type: 'update' },
                    modify: {
                        old_content: 'before',
                        new_content: 'after',
                    },
                },
            },
        },
    } as any;

    it('expands patch details by default when a permission footer is present', () => {
        let tree: ReturnType<typeof create> | null = null;
        act(() => {
            tree = create(React.createElement(CodexPatchView, {
                tool,
                metadata: null,
                permissionFooter: React.createElement('PermissionFooter', {}, 'footer'),
            }));
        });

        const output = JSON.stringify(tree.toJSON());
        expect(output).toContain('PermissionFooter');
        expect(output).toContain('ToolDiffView');
        expect(output).toContain('smokes/block-dnd-p6.verify.mjs');
    });

    it('keeps patch details collapsed by default when no permission footer is present', () => {
        let tree: ReturnType<typeof create> | null = null;
        act(() => {
            tree = create(React.createElement(CodexPatchView, {
                tool,
                metadata: null,
            }));
        });

        const output = JSON.stringify(tree.toJSON());
        expect(output).not.toContain('ToolDiffView');
        expect(output).not.toContain('smokes/block-dnd-p6.verify.mjs');
    });
});

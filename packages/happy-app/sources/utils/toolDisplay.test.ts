import { describe, expect, it } from 'vitest';
import { ToolCall } from '@/sync/typesMessage';
import {
    getPatchFiles,
    getTerminalToolCommand,
    getToolEditedFileChanges,
    getToolEditedFiles,
    getToolSummaryCategory,
    getToolSummaryDetail,
    isTerminalToolName,
    shouldRenderToolCardHeader,
} from './toolDisplay';

function tool(name: string, input: unknown): ToolCall {
    return {
        name,
        state: 'completed',
        input,
        createdAt: 1,
        startedAt: 1,
        completedAt: 2,
        description: null,
    };
}

describe('terminal tool display helpers', () => {
    it('detects command-like terminal tools', () => {
        expect(isTerminalToolName('Bash')).toBe(true);
        expect(isTerminalToolName('CodexBash')).toBe(true);
        expect(isTerminalToolName('GeminiBash')).toBe(true);
        expect(isTerminalToolName('execute')).toBe(true);
        expect(isTerminalToolName('Read')).toBe(false);
    });

    it('extracts one-line command summaries from shell tools', () => {
        expect(getTerminalToolCommand(tool('Bash', { command: 'pnpm test' }))).toBe('pnpm test');

        expect(getTerminalToolCommand(tool(
            'CodexBash',
            {
                command: ['/usr/bin/zsh', '-lc', 'git status --short'],
                parsed_cmd: [{ type: 'bash', cmd: 'git status --short' }],
            },
        ))).toBe('git status --short');
    });

    it('extracts Gemini execute titles without cwd metadata', () => {
        expect(getTerminalToolCommand(tool(
            'execute',
            { toolCall: { title: 'rm tmp.txt [current working directory /repo] (cleanup)' } },
        ))).toBe('rm tmp.txt');
    });

    it('hides Codex patch card headers on web only', () => {
        expect(shouldRenderToolCardHeader('CodexPatch', 'web')).toBe(false);
        expect(shouldRenderToolCardHeader('CodexPatch', 'ios')).toBe(true);
        expect(shouldRenderToolCardHeader('CodexPatch', 'android')).toBe(true);
        expect(shouldRenderToolCardHeader('CodexBash', 'web')).toBe(true);
    });

    it('classifies tools for compact transcript rows', () => {
        expect(getToolSummaryCategory('CodexBash')).toBe('terminal');
        expect(getToolSummaryCategory('CodexPatch')).toBe('edit');
        expect(getToolSummaryCategory('Read')).toBe('read');
        expect(getToolSummaryCategory('Grep')).toBe('search');
        expect(getToolSummaryCategory('WebFetch')).toBe('web');
    });

    it('extracts compact transcript row details', () => {
        expect(getToolSummaryDetail(tool('CodexBash', {
            command: ['/usr/bin/zsh', '-lc', 'git status --short'],
            parsed_cmd: [{ type: 'bash', cmd: 'git status --short' }],
        }))).toBe('git status --short');

        expect(getToolSummaryDetail(tool('CodexPatch', {
            changes: {
                'README-RU.md': { kind: { type: 'update' } },
            },
        }))).toBe('README-RU.md');

        expect(getToolSummaryDetail(tool('MultiEdit', {
            file_path: '/repo/src/app.tsx',
        }))).toBe('/repo/src/app.tsx');
    });

    it('dedupes edited files across repeated edit calls', () => {
        expect(getToolEditedFiles(tool('Write', {
            file_path: '/repo/src/app.tsx',
        }))).toEqual(['/repo/src/app.tsx']);
    });

    it('extracts touched files from raw apply_patch input', () => {
        const patch = [
            '*** Begin Patch',
            '*** Update File: packages/happy-cli/a.ts',
            '@@',
            '-old',
            '+new',
            '*** Update File: packages/happy-cli/a.ts',
            '@@',
            '-older',
            '+newer',
            '*** Add File: packages/happy-cli/b.ts',
            '+content',
            '*** End Patch',
        ].join('\n');

        expect(getPatchFiles({ patch })).toEqual([
            'packages/happy-cli/a.ts',
            'packages/happy-cli/b.ts',
        ]);
        expect(getToolSummaryDetail(tool('CodexPatch', { patch }))).toBe('packages/happy-cli/a.ts +1');
    });

    it('extracts per-file stats from Edit tools', () => {
        expect(getToolEditedFileChanges(tool('Edit', {
            file_path: '/repo/a.ts',
            old_string: 'before',
            new_string: 'before\nafter',
        }))).toEqual([
            {
                path: '/repo/a.ts',
                additions: 2,
                deletions: 1,
            },
        ]);
    });

    it('extracts per-file stats from raw apply_patch input', () => {
        const patch = [
            '*** Begin Patch',
            '*** Update File: packages/happy-cli/a.ts',
            '@@',
            '-old line',
            '+new line',
            '*** Add File: packages/happy-cli/b.ts',
            '+first',
            '+second',
            '*** End Patch',
        ].join('\n');

        expect(getToolEditedFileChanges(tool('CodexPatch', { patch }))).toEqual([
            {
                path: 'packages/happy-cli/a.ts',
                additions: 1,
                deletions: 1,
            },
            {
                path: 'packages/happy-cli/b.ts',
                additions: 2,
                deletions: 0,
            },
        ]);
    });
});

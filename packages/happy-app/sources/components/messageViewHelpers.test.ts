import { describe, expect, it } from 'vitest';
import {
    formatTurnSummaryPath,
    getCollapsibleUserMessagePreview,
    normalizeVisibleUserMessageText,
} from './messageViewHelpers';

describe('messageViewHelpers', () => {
    it('collapses long user messages and reports that they can expand', () => {
        const longText = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n');

        expect(getCollapsibleUserMessagePreview(longText)).toEqual({
            text: Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join('\n'),
            collapsed: true,
        });
    });

    it('keeps short user messages untouched', () => {
        expect(getCollapsibleUserMessagePreview('short message')).toEqual({
            text: 'short message',
            collapsed: false,
        });
    });

    it('formats turn summary file paths relative to the session root', () => {
        expect(formatTurnSummaryPath(
            '/Users/confidence/Documents/happy/packages/happy-cli/vitest.config.ts',
            { path: '/Users/confidence/Documents/happy' } as any,
        )).toBe('packages/happy-cli/vitest.config.ts');
    });

    it('keeps only the user request body from codex attachment wrapper text', () => {
        const text = [
            'Files mentioned by the user:',
            '',
            'codex-clipboard-a.png:',
            '/tmp/a.png',
            '',
            'My request for Codex:',
            '代码块的时候 也是',
        ].join('\n');

        expect(normalizeVisibleUserMessageText(text)).toBe('代码块的时候 也是');
    });

    it('keeps local image marker lines in user-visible text', () => {
        const text = [
            '样式兜底修复一下，现在在超大屏幕上，这一块的最大宽度 max-width是 800px, 导致没有全部用上高度，',
            '看一下, 在大屏上, max-width改成 100%',
            '',
            '[Local image: /tmp/codex-clipboard.png]',
        ].join('\n');

        expect(normalizeVisibleUserMessageText(text)).toBe([
            '样式兜底修复一下，现在在超大屏幕上，这一块的最大宽度 max-width是 800px, 导致没有全部用上高度，',
            '看一下, 在大屏上, max-width改成 100%',
            '',
            '[Local image: /tmp/codex-clipboard.png]',
        ].join('\n'));
    });
});

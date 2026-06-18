import { describe, expect, it } from 'vitest';
import { mergeSessionMetadata } from './sessionMetadata';

describe('mergeSessionMetadata', () => {
    it('preserves imported codex title fields when an older snapshot arrives later', () => {
        const merged = mergeSessionMetadata(
            {
                path: '/repo',
                host: 'local',
                flavor: 'codex',
                importedFromExternalCodex: true,
                codexThreadId: 'thread-1',
                summary: {
                    text: 'Fix session sync',
                    updatedAt: 200,
                },
                name: 'Fix session sync',
            },
            {
                path: '/repo',
                host: 'local',
                flavor: 'codex',
            },
            2,
            1,
        );

        expect(merged).toMatchObject({
            importedFromExternalCodex: true,
            codexThreadId: 'thread-1',
            name: 'Fix session sync',
            summary: {
                text: 'Fix session sync',
                updatedAt: 200,
            },
        });
    });

    it('keeps existing codex title when a same-version update omits it', () => {
        const merged = mergeSessionMetadata(
            {
                path: '/repo',
                host: 'local',
                flavor: 'codex',
                importedFromExternalCodex: true,
                name: 'Keep current title',
            },
            {
                path: '/repo',
                host: 'local',
                flavor: 'codex',
            },
            2,
            2,
        );

        expect(merged?.name).toBe('Keep current title');
        expect(merged?.importedFromExternalCodex).toBe(true);
    });
});

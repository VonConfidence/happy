import { describe, expect, it } from 'vitest';
import { isSessionArchived } from './sessionLifecycle';

describe('isSessionArchived', () => {
    it('returns true for archived lifecycle states', () => {
        expect(isSessionArchived({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                lifecycleState: 'archived',
            },
        } as any)).toBe(true);

        expect(isSessionArchived({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                lifecycleState: 'archiveRequested',
            },
        } as any)).toBe(true);
    });

    it('returns false for running and missing lifecycle states', () => {
        expect(isSessionArchived({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                lifecycleState: 'running',
            },
        } as any)).toBe(false);

        expect(isSessionArchived({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
            },
        } as any)).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';
import { buildSpawnLaunchSpec, resolveSpawnAgentCommand } from './spawnSessionArgs';

describe('spawnSessionArgs', () => {
    it('defaults to claude when no agent is provided', () => {
        expect(resolveSpawnAgentCommand(undefined)).toBe('claude');
    });

    it('includes permission mode in spawned codex args', () => {
        expect(buildSpawnLaunchSpec({
            agent: 'codex',
            permissionMode: 'full',
        })).toEqual({
            agentCommand: 'codex',
            args: [
                'codex',
                '--happy-starting-mode', 'remote',
                '--started-by', 'daemon',
                '--permission-mode', 'full',
            ],
        });
    });

    it('includes codex resume thread and permission mode together', () => {
        expect(buildSpawnLaunchSpec({
            agent: 'codex',
            permissionMode: 'full',
            resumeCodexThreadId: 'thread-1',
        })).toEqual({
            agentCommand: 'codex',
            args: [
                'codex',
                '--happy-starting-mode', 'remote',
                '--started-by', 'daemon',
                '--permission-mode', 'full',
                '--resume', 'thread-1',
            ],
        });
    });
});

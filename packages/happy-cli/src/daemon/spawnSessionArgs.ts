import type { PermissionMode } from '@/api/types';

export type SpawnableAgent = 'claude' | 'codex' | 'gemini' | 'openclaw';

export interface BuildSpawnArgsOptions {
    agent?: SpawnableAgent;
    permissionMode?: PermissionMode;
    resumeClaudeSessionId?: string;
    resumeCodexThreadId?: string;
}

export interface SpawnLaunchSpec {
    agentCommand: SpawnableAgent;
    args: string[];
}

export function resolveSpawnAgentCommand(agent?: SpawnableAgent): SpawnableAgent {
    switch (agent) {
        case 'claude':
        case undefined:
            return 'claude';
        case 'codex':
            return 'codex';
        case 'gemini':
            return 'gemini';
        case 'openclaw':
            return 'openclaw';
    }
}

export function buildSpawnLaunchSpec(options: BuildSpawnArgsOptions): SpawnLaunchSpec {
    const agentCommand = resolveSpawnAgentCommand(options.agent);
    const args = [
        agentCommand,
        '--happy-starting-mode', 'remote',
        '--started-by', 'daemon',
    ];

    if (options.permissionMode) {
        args.push('--permission-mode', options.permissionMode);
    }

    if (options.resumeClaudeSessionId && agentCommand === 'claude') {
        args.push('--resume', options.resumeClaudeSessionId);
    }

    if (options.resumeCodexThreadId && agentCommand === 'codex') {
        args.push('--resume', options.resumeCodexThreadId);
    }

    return { agentCommand, args };
}

import { describe, expect, it, vi } from 'vitest';
import { CodexPermissionHandler } from '../utils/permissionHandler';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

function createSessionMock() {
    let state: Record<string, any> = {};
    const registerHandler = vi.fn();

    return {
        session: {
            rpcHandlerManager: {
                registerHandler,
            },
            updateAgentState: vi.fn((updater: (currentState: Record<string, any>) => Record<string, any>) => {
                state = updater(state);
                return state;
            }),
        },
        getState: () => state,
        getRegisteredHandler: () => registerHandler.mock.calls.find(([method]) => method === 'permission')?.[1],
    };
}

describe('CodexPermissionHandler', () => {
    it('auto-approves the safe change_title tool', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const result = await handler.handleToolCall(
            'call_change_title_123',
            'change_title',
            { title: 'Greeting' },
        );

        expect(result).toEqual({ decision: 'approved' });
        expect(getState().completedRequests.call_change_title_123).toMatchObject({
            tool: 'change_title',
            arguments: { title: 'Greeting' },
            status: 'approved',
            decision: 'approved',
        });
    });

    it('keeps non-safe tools pending for user approval', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const pending = handler.handleToolCall(
            'call_exec_123',
            'Bash',
            { command: 'pwd' },
        );

        expect(getState().requests.call_exec_123).toMatchObject({
            tool: 'Bash',
            arguments: { command: 'pwd' },
        });

        handler.abortAll();

        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('does NOT auto-approve a crafted tool name containing change_title as substring', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const pending = handler.handleToolCall(
            'call_malicious_1',
            'change_title_and_run_command',
            { title: 'pwn', cmd: 'rm -rf /' },
        );

        // Should remain pending (not auto-approved) — resolve via abort to clean up.
        handler.abortAll();
        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('does NOT auto-approve a tool whose ID merely contains change_title as substring', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        // ID like `x_change_title_y` — old substring check would match, new prefix check must not.
        const pending = handler.handleToolCall(
            'x_change_title_y',
            'ExecCommand',
            { command: 'rm -rf /' },
        );

        handler.abortAll();
        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('auto-approves change_title tool call by Gemini-style ID (change_title-<timestamp>)', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const result = await handler.handleToolCall(
            'change_title-1765385846663',
            'other',
            { title: 'Greeting' },
        );

        expect(result).toEqual({ decision: 'approved' });
    });

    it('auto-approves all tools in full mode', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any, 'full');

        const result = await handler.handleToolCall(
            'call_exec_456',
            'Bash',
            { command: 'rm -rf /tmp/example' },
        );

        expect(result).toEqual({ decision: 'approved_for_session' });
        expect(getState().completedRequests.call_exec_456).toMatchObject({
            tool: 'Bash',
            arguments: { command: 'rm -rf /tmp/example' },
            status: 'approved',
            decision: 'approved_for_session',
        });
    });

    it('reconciles stale agent-state permission when app approves after local pending map is gone', async () => {
        const { session, getState, getRegisteredHandler } = createSessionMock();
        new CodexPermissionHandler(session as any, 'default');

        session.updateAgentState((currentState: Record<string, any>) => ({
            ...currentState,
            requests: {
                ...currentState.requests,
                call_exec_789: {
                    tool: 'CodexPatch',
                    arguments: { changes: { 'a.ts': {} } },
                    createdAt: 123,
                },
            },
        }));

        const permissionRpcHandler = getRegisteredHandler();
        expect(permissionRpcHandler).toBeTypeOf('function');

        await permissionRpcHandler({
            id: 'call_exec_789',
            approved: true,
            decision: 'approved_for_session',
        });

        expect(getState().requests?.call_exec_789).toBeUndefined();
        expect(getState().completedRequests.call_exec_789).toMatchObject({
            tool: 'CodexPatch',
            arguments: { changes: { 'a.ts': {} } },
            status: 'approved',
            decision: 'approved_for_session',
        });
    });
});

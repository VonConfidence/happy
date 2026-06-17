import { Session } from '@/sync/storageTypes';

export function isSessionArchived(session: Pick<Session, 'metadata'>): boolean {
    const lifecycleState = session.metadata?.lifecycleState;
    return lifecycleState === 'archived' || lifecycleState === 'archiveRequested';
}

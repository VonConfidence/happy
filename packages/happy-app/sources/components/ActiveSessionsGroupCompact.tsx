import React from 'react';
import { View, Pressable, Platform, ActivityIndicator, TextInput } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Text } from '@/components/StyledText';
import { Machine, Session } from '@/sync/storageTypes';
import { SessionRowData } from '@/sync/storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { type SessionState, formatPathRelativeToHome, formatLastSeen } from '@/utils/sessionUtils';
import { Avatar } from './Avatar';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { storage, useAllMachines, useSession, useSessionGitStatus, useSessions } from '@/sync/storage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useHappyAction } from '@/hooks/useHappyAction';
import { HappyError } from '@/utils/errors';
import { SessionActionsAnchor, SessionActionsPopover } from './SessionActionsPopover';
import { useSessionActionAlert } from '@/hooks/useSessionQuickActions';
import { listCodexProjectSessions, machineSpawnNewSession, sessionKill, sessionRename, type CodexProjectSessionSummary } from '@/sync/ops';
import { isWorktreePath, getRepoPath, getWorktreeName } from '@/utils/worktree';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { useRouter } from 'expo-router';
import { sync } from '@/sync/sync';
import { Modal } from '@/modal';
import { buildExternalCodexSectionState } from '@/utils/externalCodexSessions';
import { isMachineOnline } from '@/utils/machineUtils';

const STATUS_CONFIG: Record<SessionState, { color: string; dotColor: string; isPulsing: boolean; isConnected: boolean }> = {
    disconnected: { color: '#999', dotColor: '#999', isPulsing: false, isConnected: false },
    thinking: { color: '#007AFF', dotColor: '#007AFF', isPulsing: true, isConnected: true },
    waiting: { color: '#34C759', dotColor: '#34C759', isPulsing: false, isConnected: true },
    permission_required: { color: '#FF9500', dotColor: '#FF9500', isPulsing: true, isConnected: true },
};

interface ActiveSessionsGroupProps {
    sessions: SessionRowData[];
    selectedSessionId?: string;
}

/**
 * Hook to get git display info for a section header:
 * branch name, line changes, and worktree status.
 */
function useSectionGitInfo(sessionId: string) {
    const gitStatus = useSessionGitStatus(sessionId);

    return React.useMemo(() => {
        if (!gitStatus || gitStatus.lastUpdatedAt === 0) {
            return { branch: null, linesAdded: 0, linesRemoved: 0, hasChanges: false };
        }
        return {
            branch: gitStatus.branch,
            linesAdded: gitStatus.unstagedLinesAdded,
            linesRemoved: gitStatus.unstagedLinesRemoved,
            hasChanges: gitStatus.unstagedLinesAdded > 0 || gitStatus.unstagedLinesRemoved > 0,
        };
    }, [gitStatus]);
}

// Full-width separator between machine groups: ——— 🖥 name ———
const MachineSeparator = React.memo(({ machineName, machineId }: { machineName: string; machineId: string }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();

    const handlePress = React.useCallback(() => {
        router.navigate(`/machine/${machineId}` as any);
    }, [router, machineId]);

    return (
        <Pressable onPress={handlePress} style={styles.machineSeparator} hitSlop={{ top: 8, bottom: 8 }}>
            <View style={styles.machineSeparatorLine} />
            <Ionicons name="desktop-outline" size={11} color={theme.colors.textSecondary} style={{ marginHorizontal: 6 }} />
            <Text style={styles.machineSeparatorText} numberOfLines={1}>
                {machineName}
            </Text>
            <View style={styles.machineSeparatorLine} />
        </Pressable>
    );
});

export function ActiveSessionsGroupCompact({ sessions, selectedSessionId }: ActiveSessionsGroupProps) {
    const styles = stylesheet;
    const machines = useAllMachines();
    const allSessions = useSessions();

    const machinesMap = React.useMemo(() => {
        const map: Record<string, Machine> = {};
        machines.forEach(machine => {
            map[machine.id] = machine;
        });
        return map;
    }, [machines]);

    const importedCodexThreadIdsByMachineId = React.useMemo(() => {
        const out: Record<string, string[]> = {};
        for (const item of allSessions ?? []) {
            if (typeof item === 'string') continue;
            const session = item as Session;
            const machineId = session.metadata?.machineId;
            const codexThreadId = session.metadata?.codexThreadId;
            if (!machineId || !codexThreadId) continue;
            (out[machineId] ??= []).push(codexThreadId);
        }
        return out;
    }, [allSessions]);

    // Group sessions by machine, then by project within each machine
    const { machineGroups, hasMultipleMachines } = React.useMemo(() => {
        const unknownText = t('status.unknown');
        const byMachine = new Map<string, {
            machineId: string;
            machineName: string;
            projects: Map<string, {
                displayPath: string;
                sessions: SessionRowData[];
            }>;
        }>();

        sessions.forEach(session => {
            const machineId = session.machineId || unknownText;
            const machine = machineId !== unknownText ? machinesMap[machineId] : null;
            const machineName = machine?.metadata?.displayName ||
                machine?.metadata?.host ||
                (machineId !== unknownText ? machineId : `<${unknownText}>`);

            let machineGroup = byMachine.get(machineId);
            if (!machineGroup) {
                machineGroup = { machineId, machineName, projects: new Map() };
                byMachine.set(machineId, machineGroup);
            }

            const projectPath = session.path || '';
            let projectGroup = machineGroup.projects.get(projectPath);
            if (!projectGroup) {
                const displayPath = formatPathRelativeToHome(projectPath, session.homeDir ?? undefined);
                projectGroup = { displayPath, sessions: [] };
                machineGroup.projects.set(projectPath, projectGroup);
            }

            projectGroup.sessions.push(session);
        });

        // Sort sessions within each project group
        byMachine.forEach(mg => {
            mg.projects.forEach(pg => {
                pg.sessions.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
            });
        });

        const sorted = Array.from(byMachine.values()).sort((a, b) =>
            a.machineName.localeCompare(b.machineName)
        );

        return { machineGroups: sorted, hasMultipleMachines: byMachine.size > 1 };
    }, [sessions, machinesMap]);

    return (
        <View style={styles.container}>
            {machineGroups.map(machineGroup => {
                const sortedProjects = Array.from(machineGroup.projects.entries()).sort(
                    ([, a], [, b]) => a.displayPath.localeCompare(b.displayPath)
                );

                return (
                    <React.Fragment key={machineGroup.machineId}>
                        {hasMultipleMachines && (
                            <MachineSeparator
                                machineName={machineGroup.machineName}
                                machineId={machineGroup.machineId}
                            />
                        )}
                        {sortedProjects.map(([projectPath, projectGroup]) => {
                            const firstSession = projectGroup.sessions[0];
                            if (!firstSession) return null;

                            return (
                                <ProjectGroupCard
                                    key={projectPath}
                                    machine={machinesMap[machineGroup.machineId] ?? null}
                                    projectPath={projectPath}
                                    displayPath={projectGroup.displayPath}
                                    sessions={projectGroup.sessions}
                                    selectedSessionId={selectedSessionId}
                                    importedThreadIds={importedCodexThreadIdsByMachineId[machineGroup.machineId] ?? []}
                                />
                            );
                        })}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

const ProjectGroupCard = React.memo(({
    machine,
    projectPath,
    displayPath,
    sessions,
    selectedSessionId,
    importedThreadIds,
}: {
    machine: Machine | null;
    projectPath: string;
    displayPath: string;
    sessions: SessionRowData[];
    selectedSessionId?: string;
    importedThreadIds: string[];
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const navigateToSession = useNavigateToSession();
    const [externalCodexSessions, setExternalCodexSessions] = React.useState<CodexProjectSessionSummary[]>([]);
    const [hasLoadedExternalCodexSessions, setHasLoadedExternalCodexSessions] = React.useState(false);
    const [isRefreshingExternalCodex, setIsRefreshingExternalCodex] = React.useState(false);
    const [importingCodexThreadId, setImportingCodexThreadId] = React.useState<string | null>(null);

    const firstSession = sessions[0];
    if (!firstSession) {
        return null;
    }

    const externalCodexSection = React.useMemo(() => buildExternalCodexSectionState({
        selectedMachineId: machine?.id ?? null,
        isMachineOnline: !!machine && isMachineOnline(machine),
        resolvedSelectedPath: projectPath || null,
        importedThreadIds,
        sessions: externalCodexSessions,
    }), [externalCodexSessions, importedThreadIds, machine, projectPath]);

    const refreshExternalCodexSessions = React.useCallback(async () => {
        if (!machine?.id || !projectPath) {
            return;
        }

        setIsRefreshingExternalCodex(true);
        try {
            const result = await listCodexProjectSessions({
                machineId: machine.id,
                directory: projectPath,
                importedThreadIds,
            });

            if (result.type === 'success') {
                setExternalCodexSessions(result.sessions);
                setHasLoadedExternalCodexSessions(true);
                return;
            }

            Modal.alert(t('common.error'), result.errorMessage);
        } finally {
            setIsRefreshingExternalCodex(false);
        }
    }, [importedThreadIds, machine?.id, projectPath]);

    const importExternalCodexSession = React.useCallback(async (externalSession: CodexProjectSessionSummary) => {
        if (!machine?.id || !projectPath) {
            Modal.alert(t('common.error'), 'Unable to determine project path for this machine');
            return;
        }
        if (!isMachineOnline(machine)) {
            Modal.alert(t('common.error'), 'Machine is offline');
            return;
        }

        const spawnImportedSession = async (approvedNewDirectoryCreation: boolean): Promise<void> => {
            const result = await machineSpawnNewSession({
                machineId: machine.id,
                directory: projectPath,
                approvedNewDirectoryCreation,
                agent: 'codex',
                resumeCodexThreadId: externalSession.codexThreadId,
            });

            switch (result.type) {
                case 'success':
                    await sync.refreshSessions();
                    navigateToSession(result.sessionId);
                    return;
                case 'requestToApproveDirectoryCreation': {
                    const approved = await Modal.confirm(
                        'Create Directory?',
                        `The directory '${result.directory}' does not exist. Would you like to create it?`,
                        { cancelText: t('common.cancel'), confirmText: t('common.create') },
                    );
                    if (approved) {
                        await spawnImportedSession(true);
                    }
                    return;
                }
                case 'error':
                    Modal.alert(t('common.error'), result.errorMessage);
                    return;
            }
        };

        setImportingCodexThreadId(externalSession.codexThreadId);
        try {
            await spawnImportedSession(false);
        } finally {
            setImportingCodexThreadId(null);
        }
    }, [machine, navigateToSession, projectPath]);

    const showExternalCodexSection = isRefreshingExternalCodex || hasLoadedExternalCodexSessions || externalCodexSection.visibleSessions.length > 0;

    return (
        <View>
            <ProjectSectionHeader
                session={firstSession}
                displayPath={displayPath}
                projectPath={projectPath}
                canRefreshExternalCodex={externalCodexSection.canRefresh}
                isRefreshingExternalCodex={isRefreshingExternalCodex}
                onRefreshExternalCodex={() => void refreshExternalCodexSessions()}
            />
            <View style={styles.projectCard}>
                {sessions.map((session, index) => (
                    <CompactSessionRow
                        key={session.id}
                        session={session}
                        selected={selectedSessionId === session.id}
                        showBorder={index < sessions.length - 1 || showExternalCodexSection}
                    />
                ))}

                {showExternalCodexSection && (
                    <View style={styles.externalCodexSection}>
                        {externalCodexSection.visibleSessions.length > 0 ? (
                            externalCodexSection.visibleSessions.map((session, index) => (
                                <Pressable
                                    key={session.codexThreadId}
                                    accessibilityLabel={`Import external Codex session ${session.title}`}
                                    onPress={() => void importExternalCodexSession(session)}
                                    style={[
                                        styles.externalCodexRow,
                                        index < externalCodexSection.visibleSessions.length - 1 && styles.externalCodexRowWithBorder,
                                    ]}
                                >
                                    <View style={[styles.externalCodexBadge, { backgroundColor: theme.colors.button.primary.disabled }]}>
                                        <Text style={styles.externalCodexBadgeText}>Codex</Text>
                                    </View>
                                    <View style={styles.externalCodexContent}>
                                        <Text style={styles.externalCodexTitle} numberOfLines={1}>
                                            {session.title}
                                        </Text>
                                        <Text style={styles.externalCodexSubtitle} numberOfLines={1}>
                                            {formatLastSeen(session.updatedAt, false)}
                                            {session.previewText ? ` · ${session.previewText}` : ` · ${session.codexThreadId}`}
                                        </Text>
                                    </View>
                                    {importingCodexThreadId === session.codexThreadId ? (
                                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                    ) : (
                                        <Ionicons name="chevron-forward" size={14} color={theme.colors.textSecondary} />
                                    )}
                                </Pressable>
                            ))
                        ) : (
                            <View style={styles.externalCodexEmptyState}>
                                <Text style={styles.externalCodexEmptyText}>
                                    {hasLoadedExternalCodexSessions
                                        ? 'No external Codex sessions found for this project'
                                        : 'Refreshing external Codex sessions...'}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
});

const ProjectSectionHeader = React.memo(({
    session,
    displayPath,
    projectPath,
    canRefreshExternalCodex,
    isRefreshingExternalCodex,
    onRefreshExternalCodex,
}: {
    session: SessionRowData;
    displayPath: string;
    projectPath: string;
    canRefreshExternalCodex: boolean;
    isRefreshingExternalCodex: boolean;
    onRefreshExternalCodex: () => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();
    const draft = useNewSessionDraft();

    const sessionPath = session.path || '';
    const isWorktree = isWorktreePath(sessionPath);
    const repoPath = isWorktree ? getRepoPath(sessionPath) : sessionPath;
    const repoDisplayPath = isWorktree
        ? formatPathRelativeToHome(repoPath, session.homeDir ?? undefined)
        : displayPath;
    const repoFolderName = repoPath.split(/[/\\]/).filter(Boolean).pop() || repoDisplayPath;
    const worktreeName = isWorktree ? getWorktreeName(sessionPath) : null;

    const gitInfo = useSectionGitInfo(session.id);
    const branchName = worktreeName || gitInfo.branch;
    const hasBranch = !!branchName;

    const handleAdd = React.useCallback(() => {
        const machineId = session.machineId;
        if (machineId) {
            draft.setMachineId(machineId);
        }
        const pathToSet = formatPathRelativeToHome(repoPath, session.homeDir ?? undefined);
        draft.setPath(pathToSet);
        draft.setSessionType(isWorktree ? 'worktree' : 'simple');
        draft.setWorktreeKey(isWorktree ? sessionPath : null);
        router.navigate('/new');
    }, [session.machineId, session.homeDir, repoPath, isWorktree, sessionPath, draft, router]);

    const [isHovered, setIsHovered] = React.useState(false);
    const buttonOpacity = Platform.OS !== 'web' || isHovered ? 1 : 0;

    return (
        <View
            style={hasBranch ? styles.sectionHeader : styles.sectionHeaderSingleLine}
            // @ts-ignore - Web only events
            onMouseEnter={() => setIsHovered(true)}
            // @ts-ignore - Web only events
            onMouseLeave={() => setIsHovered(false)}
        >
            <View style={styles.sectionHeaderAvatar}>
                <Avatar id={session.avatarId} size={24} flavor={null} />
            </View>

            <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionHeaderPath} numberOfLines={1}>
                    {repoFolderName}
                </Text>
                {hasBranch && (
                    <View style={styles.branchRow}>
                        <Text style={styles.branchText} numberOfLines={1}>
                            {branchName}
                        </Text>
                        {isWorktree && (
                            <MaterialCommunityIcons
                                name="tree"
                                size={11}
                                color={theme.colors.textSecondary}
                                style={styles.worktreeIcon}
                            />
                        )}
                        {gitInfo.linesAdded > 0 && (
                            <Text style={styles.addedText}>+{gitInfo.linesAdded}</Text>
                        )}
                        {gitInfo.linesRemoved > 0 && (
                            <Text style={styles.removedText}>-{gitInfo.linesRemoved}</Text>
                        )}
                    </View>
                )}
            </View>

            <View style={styles.headerButtons}>
                <Pressable
                    accessibilityLabel={`Refresh external Codex sessions for ${projectPath}`}
                    onPress={onRefreshExternalCodex}
                    disabled={!canRefreshExternalCodex || isRefreshingExternalCodex}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={[
                        styles.refreshButton,
                        { opacity: (!canRefreshExternalCodex ? 0.35 : buttonOpacity) },
                    ]}
                >
                    {isRefreshingExternalCodex ? (
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    ) : (
                        <Ionicons name="refresh" size={14} color={theme.colors.textSecondary} />
                    )}
                </Pressable>

                <Pressable
                    onPress={handleAdd}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={[styles.addButton, { opacity: buttonOpacity }]}
                >
                    <Ionicons name="add-outline" size={14} color={theme.colors.textSecondary} />
                </Pressable>
            </View>
        </View>
    );
});

// Compact session row with status dot indicator
const CompactSessionRow = React.memo(({ session, selected, showBorder }: { session: SessionRowData; selected?: boolean; showBorder?: boolean }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const fullSession = useSession(session.id);
    const baseStatus = STATUS_CONFIG[session.state];
    // Override to solid blue when session has unread results
    const status = session.hasUnread
        ? { ...baseStatus, color: '#007AFF', dotColor: '#007AFF', isPulsing: false, isConnected: baseStatus.isConnected }
        : baseStatus;
    const navigateToSession = useNavigateToSession();
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = Platform.OS !== 'web';
    const [actionsAnchor, setActionsAnchor] = React.useState<SessionActionsAnchor | null>(null);
    const [isRenaming, setIsRenaming] = React.useState(false);
    const [renameDraft, setRenameDraft] = React.useState(session.name);
    const [isSubmittingRename, setIsSubmittingRename] = React.useState(false);
    const ignoreNextBlurRef = React.useRef(false);

    const [archivingSession, performArchive] = useHappyAction(async () => {
        const result = await sessionKill(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
    });

    const handleArchive = React.useCallback(() => {
        swipeableRef.current?.close();
        performArchive();
    }, [performArchive]);

    const handlePress = React.useCallback(() => {
        if (isRenaming) {
            return;
        }
        navigateToSession(session.id);
    }, [isRenaming, navigateToSession, session.id]);

    const handleContextMenu = React.useCallback((event: any) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        setActionsAnchor({
            type: 'point',
            x: event.nativeEvent.clientX ?? event.nativeEvent.pageX ?? 0,
            y: event.nativeEvent.clientY ?? event.nativeEvent.pageY ?? 0,
        });
    }, []);

    const showActionAlert = useSessionActionAlert(session.id);
    const beginRename = React.useCallback(() => {
        swipeableRef.current?.close();
        setActionsAnchor(null);
        setRenameDraft(session.name);
        setIsRenaming(true);
    }, [session.name]);
    const showRenameActionAlert = useSessionActionAlert(session.id, { onRename: beginRename });
    const menuProps = Platform.OS === 'web' ? {
        onContextMenu: handleContextMenu,
    } as any : {
        onLongPress: showRenameActionAlert ?? showActionAlert,
    };

    const cancelRename = React.useCallback(() => {
        ignoreNextBlurRef.current = false;
        setRenameDraft(session.name);
        setIsSubmittingRename(false);
        setIsRenaming(false);
    }, [session.name]);

    const submitRename = React.useCallback(async () => {
        if (!fullSession || isSubmittingRename) {
            return;
        }

        const trimmedTitle = renameDraft.trim();
        if (!trimmedTitle) {
            Modal.alert(t('common.error'), 'Session title cannot be empty');
            return;
        }

        if (trimmedTitle === session.name) {
            setIsRenaming(false);
            return;
        }

        ignoreNextBlurRef.current = true;
        setIsSubmittingRename(true);
        try {
            const result = await sessionRename(fullSession, trimmedTitle);
            const latestSession = storage.getState().sessions[fullSession.id] ?? fullSession;
            storage.getState().applySessions([{
                ...latestSession,
                metadata: result.metadata,
                metadataVersion: result.version,
                updatedAt: Date.now(),
            }]);
            setIsRenaming(false);
        } catch (error) {
            Modal.alert(
                t('common.error'),
                error instanceof Error ? error.message : 'Failed to rename session',
            );
        } finally {
            setIsSubmittingRename(false);
            setTimeout(() => {
                ignoreNextBlurRef.current = false;
            }, 0);
        }
    }, [fullSession, isSubmittingRename, renameDraft, session.name]);

    const handleRenameBlur = React.useCallback(() => {
        if (ignoreNextBlurRef.current) {
            ignoreNextBlurRef.current = false;
            return;
        }
        cancelRename();
    }, [cancelRename]);

    const renderLeadingIndicator = () => {
        let indicator: React.ReactNode = null;

        if (session.hasUnread) {
            indicator = <StatusDot color={status.dotColor} isPulsing={false} />;
        } else if (session.state === 'waiting' && session.hasDraft) {
            indicator = (
                <Ionicons
                    name="create-outline"
                    size={14}
                    color={theme.colors.textSecondary}
                />
            );
        } else if (session.state === 'permission_required' || session.state === 'thinking') {
            indicator = <StatusDot color={status.dotColor} isPulsing={status.isPulsing} />;
        } else if (session.state === 'waiting') {
            indicator = <StatusDot color={theme.colors.textSecondary} isPulsing={false} />;
        }

        return (
            <View style={styles.leadingIndicatorSlot}>
                {indicator}
            </View>
        );
    };

    const rowContent = (
        <View style={styles.sessionContent}>
            <View style={styles.sessionTitleRow}>
                {renderLeadingIndicator()}

                {isRenaming ? (
                    <View style={styles.sessionTitleInputWrap}>
                        <TextInput
                            autoFocus
                            blurOnSubmit={false}
                            editable={!isSubmittingRename}
                            onBlur={handleRenameBlur}
                            onChangeText={setRenameDraft}
                            onKeyPress={(event) => {
                                if (event.nativeEvent.key === 'Escape') {
                                    ignoreNextBlurRef.current = true;
                                    cancelRename();
                                }
                                if (event.nativeEvent.key === 'Enter') {
                                    ignoreNextBlurRef.current = true;
                                }
                            }}
                            onSubmitEditing={() => {
                                void submitRename();
                            }}
                            returnKeyType="done"
                            selectTextOnFocus
                            style={styles.sessionTitleInput}
                            value={renameDraft}
                        />
                        {isSubmittingRename && (
                            <ActivityIndicator
                                color={theme.colors.textSecondary}
                                size="small"
                                style={styles.renameSpinner}
                            />
                        )}
                    </View>
                ) : (
                    <Text
                        style={[
                            styles.sessionTitle,
                            status.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                        ]}
                        numberOfLines={2}
                    >
                        {session.name}
                    </Text>
                )}
            </View>
        </View>
    );

    const itemContent = isRenaming ? (
        <View
            style={[
                styles.sessionRow,
                showBorder && styles.sessionRowWithBorder,
                selected && styles.sessionRowSelected,
            ]}
        >
            {rowContent}
        </View>
    ) : (
        <Pressable
            style={[
                styles.sessionRow,
                showBorder && styles.sessionRowWithBorder,
                selected && styles.sessionRowSelected
            ]}
            onPress={handlePress}
            {...menuProps}
        >
            {rowContent}
        </Pressable>
    );

    if (!swipeEnabled) {
        return (
            <>
                {itemContent}
                <SessionActionsPopover
                    anchor={actionsAnchor}
                    onClose={() => setActionsAnchor(null)}
                    onRename={beginRename}
                    sessionId={session.id}
                    visible={!!actionsAnchor}
                />
            </>
        );
    }

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeAction}
            onPress={handleArchive}
            disabled={archivingSession}
        >
            <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText} numberOfLines={2}>
                {t('sessionInfo.archiveSession')}
            </Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            enabled={!archivingSession}
        >
            {itemContent}
        </Swipeable>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        paddingTop: 8,
    },
    // Section header styles
    sectionHeader: {
        paddingTop: 12,
        paddingBottom: Platform.select({ ios: 6, default: 8 }),
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionHeaderSingleLine: {
        paddingTop: 12,
        paddingBottom: Platform.select({ ios: 6, default: 8 }),
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionHeaderAvatar: {
        marginRight: 8,
    },
    sectionHeaderContent: {
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
    },
    sectionHeaderPath: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: Platform.select({ ios: 13, default: 14 }),
        lineHeight: Platform.select({ ios: 18, default: 20 }),
        letterSpacing: Platform.select({ ios: -0.08, default: 0.1 }),
        fontWeight: Platform.select({ ios: 'normal', default: '500' }),
        flexShrink: 1,
    },
    branchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 1,
    },
    branchText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
        flexShrink: 1,
    },
    worktreeIcon: {
        marginLeft: 4,
    },
    addedText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.gitAddedText,
        marginLeft: 6,
    },
    removedText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.gitRemovedText,
        marginLeft: 3,
    },
    addButton: {
        marginLeft: 2,
        padding: 8,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 4,
    },
    refreshButton: {
        padding: 8,
    },
    externalCodexSection: {
        backgroundColor: theme.colors.surface,
    },
    externalCodexRow: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
        gap: 10,
    },
    externalCodexRowWithBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    externalCodexBadge: {
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 999,
        flexShrink: 0,
    },
    externalCodexBadgeText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    externalCodexContent: {
        flex: 1,
        minWidth: 0,
    },
    externalCodexTitle: {
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    externalCodexSubtitle: {
        marginTop: 2,
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    externalCodexEmptyState: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    externalCodexEmptyText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    // Machine separator styles
    machineSeparator: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        paddingTop: 8,
        paddingBottom: 0,
    },
    machineSeparatorLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.divider,
    },
    machineSeparatorText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
        marginRight: 4,
    },
    // Project card styles
    projectCard: {
        backgroundColor: theme.colors.surface,
        marginBottom: 8,
        marginHorizontal: Platform.select({ ios: 16, default: 12 }),
        borderRadius: Platform.select({ ios: 10, default: 16 }),
        overflow: 'hidden',
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 0.33 },
        shadowOpacity: theme.colors.shadow.opacity,
        shadowRadius: 0,
        elevation: 1,
    },
    // Session row styles
    sessionRow: {
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
    },
    sessionRowWithBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    sessionRowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionContent: {
        flex: 1,
        justifyContent: 'center',
    },
    sessionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sessionTitleInputWrap: {
        flex: 1,
        minHeight: 34,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 10,
        paddingHorizontal: 10,
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionTitleInput: {
        flex: 1,
        fontSize: 15,
        color: theme.colors.text,
        paddingVertical: 0,
        ...Typography.default('regular'),
    },
    sessionTitle: {
        fontSize: 15,
        flex: 1,
        ...Typography.default('regular'),
    },
    renameSpinner: {
        marginLeft: 8,
    },
    sessionTitleConnected: {
        color: theme.colors.text,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
    },
    leadingIndicatorSlot: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        marginRight: 8,
    },
    swipeAction: {
        width: 112,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.error,
    },
    swipeActionText: {
        marginTop: 4,
        fontSize: 12,
        color: '#FFFFFF',
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
}));

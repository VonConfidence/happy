import * as React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { MarkdownView } from "./markdown/MarkdownView";
import { t } from '@/text';
import { Message, UserTextMessage, AgentTextMessage, ToolCallMessage } from "@/sync/typesMessage";
import { Metadata } from "@/sync/storageTypes";
import { ToolView } from "./tools/ToolView";
import { AgentEvent } from "@/sync/typesRaw";
import { sync } from '@/sync/sync';
import { Option } from './markdown/MarkdownView';
import { layout } from "./layout";
import { parseLocalCommandMessage, isUserSlashCommandEcho } from './parseLocalCommandMessage';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { formatTurnSummaryPath, getCollapsibleUserMessagePreview, normalizeVisibleUserMessageText } from './messageViewHelpers';


export const MessageView = React.memo((props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
  /**
   * Long-press handler for user-text bubbles. Wired by ChatList from
   * the active session screen and used by the fork-from-message flow.
   */
  onForkFromUserMessage?: (messageId: string, rewindPointId: string | undefined, messageText: string) => void;
}) => {
  return (
    <View
      style={styles.messageContainer}
      renderToHardwareTextureAndroid={Platform.OS !== 'web'}
    >
      <View style={styles.messageContent}>
        <RenderBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          getMessageById={props.getMessageById}
          onForkFromUserMessage={props.onForkFromUserMessage}
        />
      </View>
    </View>
  );
});

// RenderBlock function that dispatches to the correct component based on message kind
function RenderBlock(props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
  onForkFromUserMessage?: (messageId: string, rewindPointId: string | undefined, messageText: string) => void;
}): React.ReactElement {
  switch (props.message.kind) {
    case 'user-text':
      return (
        <UserTextBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          onForkFromUserMessage={props.onForkFromUserMessage}
        />
      );

    case 'agent-text':
      return <AgentTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'tool-call':
      return <ToolCallBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
      />;

    case 'agent-event':
      return <AgentEventBlock event={props.message.event} metadata={props.metadata} sessionId={props.sessionId} />;


    default:
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = props.message;
      throw new Error(`Unknown message kind: ${_exhaustive}`);
  }
}

function UserTextBlock(props: {
  message: UserTextMessage;
  metadata: Metadata | null;
  sessionId: string;
  onForkFromUserMessage?: (messageId: string, rewindPointId: string | undefined, messageText: string) => void;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title, { source: 'option' });
  }, [props.sessionId]);
  const [expanded, setExpanded] = React.useState(false);

  const rewindPointId = props.message.claudeUuid ?? props.message.codexItemId;
  const canFork = Boolean(props.onForkFromUserMessage)
    && (Boolean(rewindPointId) || props.metadata?.flavor === 'codex');
  const handleLongPress = React.useCallback(() => {
    if (props.onForkFromUserMessage) {
      props.onForkFromUserMessage(props.message.id, rewindPointId, props.message.text);
    }
  }, [props.message.id, props.message.text, props.onForkFromUserMessage, rewindPointId]);

  // Claude Agent SDK emits synthetic user messages wrapped in tags like
  // <local-command-caveat>…</local-command-caveat> and
  // <command-message>…</command-message><command-name>/foo</command-name>
  // whenever a slash command runs. The plain MarkdownView renders these as
  // literal text, which looks broken. Collapse them into chips or hide
  // them entirely depending on what kind of wrapper this is.
  // The user's own slash-command input is shown optimistically (carries a
  // localId); the SDK then injects the canonical wrapper chip. Hide the raw
  // echo so we don't render the command twice. Gated to Claude flavor only:
  // Codex/Gemini don't reliably emit the <command-*> wrapper, so hiding the
  // echo there would drop the command with nothing to replace it. (Absent
  // flavor == Claude, matching the convention used elsewhere.)
  const isClaudeFlavor = !props.metadata?.flavor || props.metadata.flavor === 'claude';
  if (isClaudeFlavor && isUserSlashCommandEcho(props.message.text, props.message.localId != null)) {
    return null;
  }

  const parsed = parseLocalCommandMessage(props.message.displayText || props.message.text);
  if (parsed.kind === 'caveat') {
    return null;
  }
  if (parsed.kind === 'command-run') {
    return (
      <View style={styles.userMessageContainer}>
        <View style={styles.commandChip}>
          <Text style={styles.commandChipText}>/{parsed.commandName}</Text>
        </View>
      </View>
    );
  }

  const visibleText = normalizeVisibleUserMessageText(parsed.text);
  const preview = getCollapsibleUserMessagePreview(visibleText);
  const displayedText = expanded || !preview.collapsed ? visibleText : preview.text;

  return (
    <View style={styles.userMessageContainer}>
      <Pressable
        onLongPress={canFork ? handleLongPress : undefined}
        delayLongPress={400}
        style={styles.userMessageBubble}
      >
        <MarkdownView markdown={displayedText} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
        {preview.collapsed ? (
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            style={({ pressed }) => [styles.userMessageExpandButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.userMessageExpandText}>
              {expanded ? '收起' : '显示更多'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={styles.userMessageExpandText.color}
            />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

function AgentTextBlock(props: {
  message: AgentTextMessage;
  sessionId: string;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title, { source: 'option' });
  }, [props.sessionId]);

  // Hide thinking messages
  if (props.message.isThinking) {
    return null;
  }

  return (
    <View style={styles.agentMessageContainer}>
      <MarkdownView markdown={props.message.text} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
    </View>
  );
}

function AgentEventBlock(props: {
  event: AgentEvent;
  metadata: Metadata | null;
  sessionId: string;
}) {
  if (props.event.type === 'turn-file-summary') {
    return <TurnFileSummaryBlock event={props.event} metadata={props.metadata} sessionId={props.sessionId} />;
  }
  if (props.event.type === 'switch') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{t('message.switchedToMode', { mode: props.event.mode })}</Text>
      </View>
    );
  }
  if (props.event.type === 'message') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{props.event.message}</Text>
      </View>
    );
  }
  if (props.event.type === 'limit-reached') {
    const formatTime = (timestamp: number): string => {
      try {
        const date = new Date(timestamp * 1000); // Convert from Unix timestamp
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return t('message.unknownTime');
      }
    };

    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>
          {t('message.usageLimitUntil', { time: formatTime(props.event.endsAt) })}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.agentEventContainer}>
      <Text style={styles.agentEventText}>{t('message.unknownEvent')}</Text>
    </View>
  );
}

function TurnFileSummaryBlock(props: {
  event: Extract<AgentEvent, { type: 'turn-file-summary' }>;
  sessionId: string;
  metadata: Metadata | null;
}) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);

  const files = props.event.files;
  const visibleFiles = expanded ? files : files.slice(0, 3);
  const hiddenCount = files.length - visibleFiles.length;

  const openAllChanges = React.useCallback(() => {
    router.push(`/session/${props.sessionId}/files`);
  }, [props.sessionId, router]);

  const openFileDiff = React.useCallback((path: string) => {
    router.push(`/session/${props.sessionId}/file?path=${btoa(path)}`);
  }, [props.sessionId, router]);

  return (
    <View style={styles.summaryCardOuter}>
      <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
        <View style={[styles.summaryHeader, { backgroundColor: theme.colors.surfaceHigh, borderBottomColor: theme.colors.divider }]}>
          <View style={styles.summaryHeaderMain}>
            <View style={[styles.summaryIconWrap, { backgroundColor: theme.colors.surface }]}>
              <Octicons name="file-diff" size={16} color={theme.colors.text} />
            </View>
            <View style={styles.summaryHeaderText}>
              <Text style={[styles.summaryTitle, { color: theme.colors.text }]}>
                {`已编辑 ${files.length} 个文件`}
              </Text>
              <Pressable onPress={openAllChanges} style={({ pressed }) => pressed ? styles.pressed : null}>
                <Text style={[styles.summaryLink, { color: theme.colors.textSecondary }]}>查看更改 ↗</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.summaryList}>
          {visibleFiles.map((file) => (
            <Pressable
              key={file.path}
              onPress={() => openFileDiff(file.path)}
              style={({ pressed }) => [
                styles.summaryRow,
                { borderBottomColor: theme.colors.divider },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text numberOfLines={1} style={[styles.summaryPath, { color: theme.colors.text }]}>
                {formatTurnSummaryPath(file.path, props.metadata)}
              </Text>
              {(file.additions > 0 || file.deletions > 0) ? (
                <View style={styles.summaryStats}>
                  <Text style={styles.summaryAdded}>{`+${file.additions}`}</Text>
                  <Text style={styles.summaryRemoved}>{`-${file.deletions}`}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={14} color={theme.colors.textSecondary} />
              )}
            </Pressable>
          ))}
        </View>

        {hiddenCount > 0 ? (
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            style={({ pressed }) => [
              styles.summaryFooter,
              { borderTopColor: theme.colors.divider },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.summaryFooterText, { color: theme.colors.text }]}>
              {expanded ? '收起' : `再显示 ${hiddenCount} 个文件`}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ToolCallBlock(props: {
  message: ToolCallMessage;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) {
  if (!props.message.tool) {
    return null;
  }
  return (
    <View style={styles.toolContainer}>
      <ToolView
        tool={props.message.tool}
        metadata={props.metadata}
        messages={props.message.children}
        sessionId={props.sessionId}
        messageId={props.message.id}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  messageContent: {
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: layout.maxWidth,
    overflow: 'hidden',
  },
  userMessageContainer: {
    maxWidth: '100%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  userMessageBubble: {
    backgroundColor: theme.colors.userMessageBackground,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '100%',
  },
  userMessageExpandButton: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  userMessageExpandText: {
    color: theme.colors.input.text,
    fontSize: 13,
    opacity: 0.8,
  },
  commandChip: {
    backgroundColor: theme.colors.userMessageBackground,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 12,
    maxWidth: '100%',
    opacity: 0.65,
  },
  commandChipText: {
    color: theme.colors.input.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  agentMessageContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    maxWidth: '100%',
  },
  agentEventContainer: {
    marginHorizontal: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  agentEventText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  toolContainer: {
    marginHorizontal: 8,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  summaryCardOuter: {
    marginHorizontal: 8,
    marginBottom: 12,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  summaryHeaderMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHeaderText: {
    flex: 1,
    gap: 2,
  },
  summaryTitle: {
    fontSize: 16,
  },
  summaryLink: {
    fontSize: 13,
  },
  summaryList: {
    width: '100%',
  },
  summaryRow: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
  },
  summaryPath: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryAdded: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#34C759',
  },
  summaryRemoved: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#FF3B30',
  },
  summaryFooter: {
    minHeight: 40,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
  },
  summaryFooterText: {
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  debugText: {
    color: theme.colors.agentEventText,
    fontSize: 12,
  },
}));

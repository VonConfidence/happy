import * as React from 'react';
import { ToolViewProps } from './_all';
import { Text, View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { knownTools } from '../../tools/knownTools';
import { Ionicons } from '@expo/vector-icons';
import { ToolCall } from '@/sync/typesMessage';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { Message } from '@/sync/typesMessage';

interface FilteredTool {
    tool: ToolCall;
    title: string;
    state: 'running' | 'completed' | 'error';
    depth: number;
}

export const TaskView = React.memo<ToolViewProps>(({ tool, metadata, messages }) => {
    const { theme } = useUnistyles();
    const filtered = collectToolChain(messages, metadata);

    const styles = StyleSheet.create({
        container: {
            paddingVertical: 4,
            paddingBottom: 12
        },
        toolItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 4,
            paddingLeft: 4,
            paddingRight: 2
        },
        toolTitle: {
            fontSize: 14,
            fontWeight: '500',
            color: theme.colors.textSecondary,
            fontFamily: 'monospace',
            flex: 1,
        },
        statusContainer: {
            marginLeft: 'auto',
            paddingLeft: 8,
        },
        loadingItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
            paddingHorizontal: 4,
        },
        loadingText: {
            marginLeft: 8,
            fontSize: 14,
            color: theme.colors.textSecondary,
        },
        moreToolsItem: {
            paddingVertical: 4,
            paddingHorizontal: 4,
        },
        moreToolsText: {
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontStyle: 'italic',
            opacity: 0.7,
        },
    });

    if (filtered.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            {filtered.map((item, index) => (
                <View
                    key={`${item.tool.name}-${index}`}
                    style={[
                        styles.toolItem,
                        item.depth > 0 ? { paddingLeft: 4 + item.depth * 14 } : null
                    ]}
                >
                    <Text style={styles.toolTitle}>{item.title}</Text>
                    <View style={styles.statusContainer}>
                        {item.state === 'running' && (
                            <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={theme.colors.warning} />
                        )}
                        {item.state === 'completed' && (
                            <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                        )}
                        {item.state === 'error' && (
                            <Ionicons name="close-circle" size={16} color={theme.colors.textDestructive} />
                        )}
                    </View>
                </View>
            ))}
        </View>
    );
});

function collectToolChain(messages: Message[], metadata: ToolViewProps['metadata'], depth: number = 0): FilteredTool[] {
    const filtered: FilteredTool[] = [];
    const toolMessages = messages
        .filter((message): message is Extract<Message, { kind: 'tool-call' }> => message.kind === 'tool-call')
        .sort((a, b) => getToolTimestamp(a.tool) - getToolTimestamp(b.tool));

    for (const message of toolMessages) {
        filtered.push({
            tool: message.tool,
            title: getToolTitle(message.tool, metadata),
            state: message.tool.state,
            depth,
        });

        if (message.children.length > 0) {
            filtered.push(...collectToolChain(message.children, metadata, depth + 1));
        }
    }

    return filtered;
}

function getToolTimestamp(tool: ToolCall) {
    return tool.completedAt ?? tool.startedAt ?? tool.createdAt;
}

function getToolTitle(tool: ToolCall, metadata: ToolViewProps['metadata']) {
    const knownTool = knownTools[tool.name as keyof typeof knownTools] as any;
    let title = tool.name;
    if (knownTool) {
        if ('extractDescription' in knownTool && typeof knownTool.extractDescription === 'function') {
            title = knownTool.extractDescription({ tool, metadata });
        } else if (knownTool.title) {
            title = typeof knownTool.title === 'function'
                ? knownTool.title({ tool, metadata })
                : knownTool.title;
        }
    }
    return title;
}

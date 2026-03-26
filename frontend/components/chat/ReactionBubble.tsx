import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacingX } from '@/constants/theme';

interface Reaction {
  emoji: string;
  count: number;
  users: string[];
}

interface Props {
  reactions: Reaction[];
  currentUserId: string;
  onReact: (emoji: string) => void;
}

export function ReactionBubble({ reactions, currentUserId, onReact }: Props) {
  if (!reactions?.length) return null;

  return (
    <View style={styles.container}>
      {reactions.map((reaction) => {
        const iReacted = reaction.users.includes(currentUserId);
        return (
          <Pressable
            key={reaction.emoji}
            style={[styles.pill, iReacted && styles.pillActive]}
            onPress={() => onReact(reaction.emoji)}
          >
            <Text style={styles.emojiText}>{reaction.emoji}</Text>
            {reaction.count > 1 && (
              <Text style={[styles.count, iReacted && styles.countActive]}>
                {reaction.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    marginLeft: spacingX._8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral100,
    borderRadius: 12,
    paddingHorizontal: spacingX._8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  emojiText: { fontSize: 14 },
  count: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.neutral600,
    marginLeft: 3
  },
  countActive: { color: colors.primary },
});

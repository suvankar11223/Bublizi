import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  content: string;
  createdAt: string;
}

export function AIMessageBubble({ content, createdAt }: Props) {
  const timeStr = new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={s.row}>
      <View style={s.avatar}>
        <Text style={s.emoji}>🤖</Text>
      </View>
      <View style={s.bubble}>
        <View style={s.nameRow}>
          <Text style={s.name}>Chatzi AI</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>AI</Text>
          </View>
        </View>
        <Text style={s.content}>{content}</Text>
        <Text style={s.time}>{timeStr}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginVertical: 2,
    gap: 8,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emoji: { fontSize: 15 },
  bubble: {
    maxWidth: '78%',
    backgroundColor: '#f5f5ff',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  name: { fontSize: 11, fontWeight: '700', color: '#6366f1' },
  badge: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 8,
    color: '#6366f1',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  content: { fontSize: 15, color: '#1e1e2e', lineHeight: 22 },
  time: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});

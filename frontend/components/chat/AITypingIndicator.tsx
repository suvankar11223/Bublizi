import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

export function AITypingIndicator({ visible }: { visible: boolean }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

      const makeDotAnim = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, { toValue: -5, duration: 280, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
            Animated.delay(400),
          ])
        );

      const a1 = makeDotAnim(dot1, 0);
      const a2 = makeDotAnim(dot2, 140);
      const a3 = makeDotAnim(dot3, 280);

      a1.start(); a2.start(); a3.start();

      return () => { a1.stop(); a2.stop(); a3.stop(); };
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      dot1.setValue(0); dot2.setValue(0); dot3.setValue(0);
    }
  }, [visible, dot1, dot2, dot3, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[s.row, { opacity }]}>
      <View style={s.avatar}>
        <Text style={s.emoji}>🤖</Text>
      </View>
      <View style={s.bubble}>
        <Text style={s.name}>Chatzi AI</Text>
        <View style={s.dots}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View key={i} style={[s.dot, { transform: [{ translateY: dot }] }]} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.35)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emoji: { fontSize: 15 },
  bubble: {
    backgroundColor: '#f0f0ff',
    borderRadius: 16, borderTopLeftRadius: 4,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
    paddingHorizontal: 14, paddingVertical: 10,
    gap: 4,
  },
  name: { fontSize: 10, fontWeight: '700', color: '#6366f1' },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center', height: 14 },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#6366f1',
  },
});

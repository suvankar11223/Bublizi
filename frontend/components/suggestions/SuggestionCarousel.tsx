import React, { useRef, useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { SuggestionCard as SuggestionCardType, SuggestionAction } from '../../types/suggestions';
import { SuggestionCard, CARD_WIDTH } from './SuggestionCard';
import { colors, spacingX, spacingY } from '../../constants/theme';
import Typo from '../Typo';

const CARD_SPACING = 12;

interface SuggestionCarouselProps {
  suggestions: SuggestionCardType[];
  isProcessing: boolean;
  onAction: (action: SuggestionAction, card: SuggestionCardType) => void;
  onDismiss: (id: string) => void;
}

export const SuggestionCarousel: React.FC<SuggestionCarouselProps> = ({
  suggestions,
  isProcessing,
  onAction,
  onDismiss,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const mountAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (suggestions.length > 0) {
      Animated.spring(mountAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
        delay: 100,
      }).start();
    }
  }, [suggestions.length, mountAnim]);

  useEffect(() => {
    if (isProcessing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isProcessing, pulseAnim]);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_SPACING));
    setActiveIndex(index);
  };

  if (!isProcessing && suggestions.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: mountAnim,
          transform: [{
            translateY: mountAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-20, 0],
            }),
          }],
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Animated.View style={[styles.liveDot, { opacity: isProcessing ? pulseAnim : 1 }]} />
          <Typo size={13} fontWeight="600" color={colors.neutral600}>
            {isProcessing ? 'Analyzing chats...' : '✨ Smart Suggestions'}
          </Typo>
        </View>
        {suggestions.length > 0 && (
          <View style={styles.countBadge}>
            <Typo size={11} fontWeight="700" color={colors.white}>{suggestions.length}</Typo>
          </View>
        )}
      </View>

      {/* Processing state */}
      {isProcessing && suggestions.length === 0 && (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Typo size={13} color={colors.neutral500}>Reading your conversations...</Typo>
        </View>
      )}

      {/* Cards */}
      {suggestions.length > 0 && (
        <>
          <FlatList
            data={suggestions}
            keyExtractor={item => item.id}
            horizontal
            pagingEnabled={false}
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_SPACING}
            snapToAlignment="start"
            decelerationRate="fast"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <SuggestionCard card={item} onAction={onAction} onDismiss={onDismiss} />
            )}
            ItemSeparatorComponent={() => <View style={{ width: CARD_SPACING }} />}
          />

          {/* Dot Indicators */}
          {suggestions.length > 1 && (
            <View style={styles.dots}>
              {suggestions.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === activeIndex
                      ? [styles.dotActive, { backgroundColor: suggestions[i]?.accentColor || colors.primary }]
                      : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: spacingY._15,
    paddingBottom: spacingY._10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacingX._20,
    marginBottom: spacingY._12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  countBadge: {
    backgroundColor: colors.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacingX._20,
    paddingBottom: spacingY._12,
  },
  listContent: {
    paddingHorizontal: spacingX._20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacingY._12,
  },
  dot: {
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    height: 5,
  },
  dotInactive: {
    width: 5,
    height: 5,
    backgroundColor: colors.neutral200,
  },
});

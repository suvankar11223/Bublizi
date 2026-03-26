import React, { useRef } from 'react';
import { Animated, StyleSheet, View, TouchableOpacity, PanResponder } from 'react-native';
import { colors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';

type SwipeableConversationItemProps = {
  children: React.ReactNode;
  onMute?: () => void;
  onDelete?: () => void;
  isMuted?: boolean;
};

const SWIPE_THRESHOLD = -60;
const ACTION_WIDTH = 70;

export const SwipeableConversationItem = ({
  children,
  onMute,
  onDelete,
  isMuted = false,
}: SwipeableConversationItemProps) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderGrant: () => {
        translateX.setOffset(lastOffset.current);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        translateX.flattenOffset();
        
        if (gestureState.dx < SWIPE_THRESHOLD) {
          Animated.spring(translateX, {
            toValue: -ACTION_WIDTH * 2,
            useNativeDriver: true,
            tension: 65,
            friction: 9,
          }).start();
          lastOffset.current = -ACTION_WIDTH * 2;
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 9,
          }).start();
          lastOffset.current = 0;
        }
      },
    })
  ).current;

  const handleAction = (action?: () => void) => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 9,
    }).start();
    lastOffset.current = 0;
    
    if (action) action();
  };

  return (
    <View style={styles.container}>
      <View style={styles.actionsContainer}>
        {onMute && (
          <TouchableOpacity
            style={[styles.actionButton, styles.muteButton]}
            onPress={() => handleAction(onMute)}
            activeOpacity={0.8}
          >
            <Feather name={isMuted ? "bell" : "bell-off"} size={22} color={colors.white} />
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleAction(onDelete)}
            activeOpacity={0.8}
          >
            <Feather name="trash-2" size={22} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <Animated.View
        style={[
          styles.swipeableContent,
          {
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: colors.white,
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionButton: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteButton: {
    backgroundColor: colors.primaryDark,
  },
  deleteButton: {
    backgroundColor: colors.rose,
  },
  swipeableContent: {
    backgroundColor: colors.white,
  },
});


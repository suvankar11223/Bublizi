import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';

type StatusRingProps = {
  size: number;
  hasStory: boolean;
  children: React.ReactNode;
};

export const StatusRing = ({ size, hasStory, children }: StatusRingProps) => {
  if (!hasStory) {
    // No story - just render children without ring
    return <>{children}</>;
  }

  const ringSize = size + 6;
  const ringColor = colors.primary;

  return (
    <View style={{ width: ringSize, height: ringSize }}>
      {/* Story ring gradient effect */}
      <View
        style={[
          styles.storyRing,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: ringColor,
            borderWidth: 2.5,
          },
        ]}
      />
      
      {/* Avatar container */}
      <View
        style={[
          styles.avatarContainer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            top: 3,
            left: 3,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  storyRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  avatarContainer: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.white,
  },
});


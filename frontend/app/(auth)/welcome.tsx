import { Image, StyleSheet, View, Animated } from 'react-native'
import React, { useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'
import ScreenWrapper from '@/components/ScreenWrapper'
import { colors, spacingX, spacingY } from '@/constants/theme'
import { verticalScale } from '@/utils/styling'
import Typo from '@/components/Typo'
import Button from '@/components/Button'

const AnimatedImage = Animated.createAnimatedComponent(Image)

const Welcome = () => {
  const router = useRouter()
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start()
  }, [fadeAnim])

  return (
    <ScreenWrapper showPattern={true}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Typo color={colors.white} size={35} fontWeight="900">
            Sharingzi
          </Typo>
        </View>
        <AnimatedImage
          style={[styles.welcomeImage, { marginBottom: -20, opacity: fadeAnim }]}
          source={require('../../images/panda.png')}
          resizeMode='contain'
        />
        <View>
          <Typo color={colors.white} size={28} fontWeight="800">
            Stay Connected
          </Typo>
          <Typo color={colors.white} size={28} fontWeight="800">
            To Your
          </Typo>
          <Typo color={colors.white} size={28} fontWeight="800">
            Family and friends
          </Typo>
        </View>

        <Button onPress={() => router.push('/(auth)/register')}>
          <Typo color={colors.neutral900} size={18} fontWeight="800">
            Get Started
          </Typo>
        </Button>
      </View>
    </ScreenWrapper>
  )
}

export default Welcome

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-around",
    paddingHorizontal: spacingX._20,
    marginVertical: spacingY._10,
  },
  header: {
    alignItems: 'center',
  },
  background: {
    flex: 1,
    backgroundColor: colors.neutral900,
  },
  welcomeImage: {
    height: verticalScale(300),
    aspectRatio: 1,
    alignSelf: "center",
  },
})

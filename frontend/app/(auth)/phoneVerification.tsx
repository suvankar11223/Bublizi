import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendOTP, verifyOTP, resendOTP } from '@/services/firebaseAuth';
import { useAuth } from '@/context/authContext';
import { getApiUrl } from '@/utils/network';
import ScreenWrapper from '@/components/ScreenWrapper';
import BackButton from '@/components/BackButton';
import Button from '@/components/Button';
import Input from '@/components/Input';
import { colors } from '@/constants/theme';

export default function PhoneVerificationScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [e164Phone, setE164Phone] = useState('');
  
  const router = useRouter();
  const { token, refreshUser } = useAuth();
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startResendTimer = () => {
    setResendTimer(60);
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOTP = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await sendOTP(phoneNumber);
      
      if (result.success) {
        setE164Phone(result.e164Phone || '');
        setStep('otp');
        startResendTimer();
        Alert.alert('Success', result.message);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim() || otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Verify OTP with Firebase
      const result = await verifyOTP(otp);
      
      if (!result.success) {
        Alert.alert('Error', result.message);
        setLoading(false);
        return;
      }

      // Step 2: Send Firebase token to backend to link phone
      const apiUrl = await getApiUrl();
      const response = await fetch(`${apiUrl}/api/phone/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          firebaseIdToken: result.firebaseToken,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update user context with phone number
        refreshUser({
          ...data.data,
          id: data.data.id,
        });
        
        // Cache phone verified status
        await AsyncStorage.setItem('phoneVerified', 'true');
        
        Alert.alert('Success', 'Phone number verified!', [
          {
            text: 'Continue',
            onPress: () => router.replace('/(auth)/contactsSync'),
          },
        ]);
      } else {
        Alert.alert('Error', data.msg || 'Failed to verify phone number');
      }
    } catch (error: any) {
      console.error('[PhoneVerification] Error:', error);
      Alert.alert('Error', 'Failed to verify phone number. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;

    setLoading(true);
    try {
      const result = await resendOTP(phoneNumber);
      
      if (result.success) {
        startResendTimer();
        Alert.alert('Success', 'OTP resent successfully');
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <BackButton router={router} />
        
        <View style={styles.content}>
          <Text style={styles.title}>
            {step === 'phone' ? 'Verify Phone Number' : 'Enter OTP'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'phone'
              ? 'We\'ll send you a verification code to find your friends on Bublizi'
              : `Enter the 6-digit code sent to ${e164Phone}`}
          </Text>

          {step === 'phone' ? (
            <>
              <Input
                placeholder="Phone number (10 digits)"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                maxLength={10}
                autoFocus
              />
              <Button
                title={loading ? 'Sending...' : 'Send OTP'}
                onPress={handleSendOTP}
                loading={loading}
              />
            </>
          ) : (
            <>
              <Input
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              <Button
                title={loading ? 'Verifying...' : 'Verify OTP'}
                onPress={handleVerifyOTP}
                loading={loading}
              />
              
              <TouchableOpacity
                onPress={handleResendOTP}
                disabled={resendTimer > 0 || loading}
                style={styles.resendButton}
              >
                <Text style={[
                  styles.resendText,
                  (resendTimer > 0 || loading) && styles.resendTextDisabled
                ]}>
                  {resendTimer > 0
                    ? `Resend OTP in ${resendTimer}s`
                    : 'Resend OTP'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setStep('phone');
                  setOtp('');
                }}
                style={styles.changeNumberButton}
              >
                <Text style={styles.changeNumberText}>Change Phone Number</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textLight,
    marginBottom: 20,
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 10,
  },
  resendText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: theme.colors.textLight,
  },
  changeNumberButton: {
    alignItems: 'center',
    marginTop: 20,
  },
  changeNumberText: {
    color: theme.colors.textLight,
    fontSize: 14,
  },
});

/***
 * services/firebaseAuth.ts — Firebase Phone Authentication
 * Handles phone OTP via Firebase (free, replaces Fast2SMS)
 */
import auth from '@react-native-firebase/auth'

// Hold confirmation result between send and verify steps
let _confirmationResult: any = null

// ── Normalize any Indian phone format to E.164 ────────────────────────
export const normalizeToE164 = (raw: string): string => {
  const digits = raw.replace(/\D/g, '')
  
  if (digits.length === 10)                             return `+91${digits}`
  if (digits.length === 11 && digits.startsWith('0'))   return `+91${digits.slice(1)}`
  if (digits.length === 12 && digits.startsWith('91'))  return `+${digits}`
  
  return `+91${digits.slice(-10)}`
}

// ── Send OTP ──────────────────────────────────────────────────────────
export const sendOTP = async (phoneNumber: string): Promise<{ 
  success: boolean; 
  e164Phone?: string; 
  message: string 
}> => {
  const e164Phone = normalizeToE164(phoneNumber)
  
  if (e164Phone.replace(/\D/g, '').length < 11) {
    return { 
      success: false, 
      message: 'Please enter a valid 10-digit phone number' 
    }
  }

  try {
    _confirmationResult = await auth().signInWithPhoneNumber(e164Phone)
    console.log('[Firebase] OTP sent to', e164Phone)
    
    return { 
      success: true, 
      e164Phone, 
      message: `OTP sent to ${e164Phone}` 
    }
  } catch (error: any) {
    console.error('[Firebase] sendOTP error:', error.code)
    
    const messages: Record<string, string> = {
      'auth/invalid-phone-number':   'Invalid phone number. Please check and try again.',
      'auth/too-many-requests':      'Too many attempts. Please wait a few minutes.',
      'auth/quota-exceeded':         'Daily SMS limit reached. Try again tomorrow.',
      'auth/network-request-failed': 'No internet. Please check your connection.',
      'auth/app-not-authorized':     'App not authorized for Firebase. Check SHA fingerprint.',
    }
    
    return {
      success: false,
      message: messages[error.code] || `Failed to send OTP. (${error.code})`,
    }
  }
}

// ── Verify OTP ────────────────────────────────────────────────────────
export const verifyOTP = async (otp: string): Promise<{ 
  success: boolean; 
  firebaseToken?: string; 
  message: string 
}> => {
  if (!_confirmationResult) {
    return { 
      success: false, 
      message: 'Session expired. Please request a new OTP.' 
    }
  }

  const cleanOTP = otp.replace(/\D/g, '').trim()
  if (cleanOTP.length !== 6) {
    return { 
      success: false, 
      message: 'OTP must be exactly 6 digits' 
    }
  }

  try {
    const credential = await _confirmationResult.confirm(cleanOTP)
    const firebaseToken = await credential.user.getIdToken()
    
    _confirmationResult = null
    console.log('[Firebase] OTP verified successfully')
    
    return { 
      success: true, 
      firebaseToken, 
      message: 'Phone verified successfully' 
    }
  } catch (error: any) {
    console.error('[Firebase] verifyOTP error:', error.code)
    
    const messages: Record<string, string> = {
      'auth/invalid-verification-code': 'Wrong OTP. Please check and try again.',
      'auth/code-expired':              'OTP expired. Please request a new one.',
      'auth/session-expired':           'Session expired. Please request a new OTP.',
      'auth/too-many-requests':         'Too many attempts. Please request a new OTP.',
    }
    
    return {
      success: false,
      message: messages[error.code] || 'Verification failed. Please try again.',
    }
  }
}

// ── Resend OTP ────────────────────────────────────────────────────────
export const resendOTP = async (phoneNumber: string) => {
  _confirmationResult = null
  return sendOTP(phoneNumber)
}
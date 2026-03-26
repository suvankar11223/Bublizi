/***
 * controllers/otp.controller.ts — Firebase Phone Authentication
 * Fast2SMS removed. Firebase verifies OTP on frontend.
 * This backend just verifies the Firebase token (free).
 */
import { Request, Response } from 'express'
import { generateToken } from '../utils/token.js'
import User from '../modals/userModal.js'
import { getFirebaseAdmin } from '../config/firebaseAdmin.js'

// ─────────────────────────────────────────────────────────────────────
// POST /api/otp/verify-firebase
// Body: { firebaseToken: string, phone: string }
// ─────────────────────────────────────────────────────────────────────
export const verifyFirebasePhone = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { firebaseToken, phone } = req.body

  if (!firebaseToken || typeof firebaseToken !== 'string') {
    res.status(400).json({ success: false, msg: 'Firebase token is required' })
    return
  }

  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, msg: 'Phone number is required' })
    return
  }

  try {
    // ── Verify Firebase token (free, Google's servers) ────────────────
    const admin = getFirebaseAdmin()
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken)
    const verifiedPhone = decodedToken.phone_number

    if (!verifiedPhone) {
      res.status(400).json({
        success: false,
        msg: 'No phone number in Firebase token.',
      })
      return
    }

    // Sanity check: token phone matches what frontend sent
    const last10 = (p: string) => p.replace(/\D/g, '').slice(-10)
    if (last10(verifiedPhone) !== last10(phone)) {
      res.status(400).json({ success: false, msg: 'Phone number mismatch.' })
      return
    }

    // ── Find or create MongoDB user (atomic — no race condition) ──────
    const digits = verifiedPhone.replace(/\D/g, '').slice(-10)
    const phoneVariants = [
      verifiedPhone,
      digits,
      `91${digits}`,
      `0${digits}`,
    ]

    const user = await User.findOneAndUpdate(
      { phoneNumber: { $in: phoneVariants } },
      {
        $setOnInsert: {
          phoneNumber: verifiedPhone,
          name: `User ${digits.slice(-4)}`,
          email: `phone_${digits}@bublizi.app`,
          password: require('crypto').randomBytes(32).toString('hex'),
          created: new Date(),
        },
        $set: { isPhoneVerified: true, phoneNumber: verifiedPhone },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    const isNewUser = user!.name?.startsWith('User ')

    // ── Generate your app's JWT ───────────────────────────────────────
    const appToken = generateToken(
      user!._id.toString(),
      user!.email,
      user!.name || ''
    )

    console.log(`[Firebase Auth] ${isNewUser ? 'New' : 'Returning'} user: ${verifiedPhone}`)

    res.status(200).json({
      success: true,
      msg: 'Phone verified successfully',
      token: appToken,
      isNewUser,
      data: {
        id: user!._id.toString(),
        name: user!.name,
        email: user!.email,
        phone: user!.phoneNumber,
        avatar: user!.avatar || null,
        isPhoneVerified: true,
      },
    })
  } catch (error: any) {
    console.error('[Firebase Auth] Error:', error.code, error.message)

    if (error.code === 'auth/id-token-expired') {
      res.status(401).json({ success: false, msg: 'Session expired. Please verify again.' })
      return
    }

    if (error.code === 'auth/argument-error') {
      res.status(400).json({ success: false, msg: 'Invalid token format.' })
      return
    }

    res.status(500).json({ success: false, msg: 'Verification failed. Please try again.' })
  }
}
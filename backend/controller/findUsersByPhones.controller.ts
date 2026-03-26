/***
 * findUsersByPhones.controller.ts
 * ─────────────────────────────────────────────────────────────────
 * POST /api/user/find-by-phones
 * Body: { phones: string[] }  ← E.164 or 10-digit Indian numbers
 *
 * CRITICAL: Returns MongoDB _id (not clerkId) so that:
 *   ✅ Conversations work  (participants use _id)
 *   ✅ Calls work          (callerId/receiverId use _id)
 *   ✅ Online status works (onlineUsers Map uses _id)
 *   ✅ Socket rooms work   (userId = mongo _id)
 * ─────────────────────────────────────────────────────────────────
 */

import { Request, Response } from 'express'
import User from '../modals/userModal.js'

// ─── Normalize to 10-digit Indian number ─────────────────────────────
const normalizeToTenDigit = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  if (digits.length === 12) return digits.slice(2)
  return digits
}

// ─── Build all variants of a phone number to search against ──────────
const buildPhoneVariants = (phone: string): string[] => {
  const ten = normalizeToTenDigit(phone)
  return [
    ten,
    `+91${ten}`,
    `91${ten}`,
    `0${ten}`,
  ]
}

export const findUsersByPhones = async (req: Request, res: Response): Promise<void> => {
  const { phones } = req.body

  if (!phones || !Array.isArray(phones) || phones.length === 0) {
    res.status(400).json({ success: false, msg: 'phones array is required' })
    return
  }

  const safePhones: string[] = phones.slice(0, 200)
  const requestingUserId = (req as any).user?.id || (req as any).user?.userId

  try {
    const allVariants: string[] = []
    safePhones.forEach((p) => {
      allVariants.push(...buildPhoneVariants(p))
    })

    const matchedUsers = await User.find({
      phoneNumber: { $in: allVariants },
      _id: { $ne: requestingUserId },
    }).select('_id name email phoneNumber avatar clerkId isPhoneVerified')

    const seen = new Set<string>()
    const uniqueUsers = matchedUsers.filter((u) => {
      const id = u._id.toString()
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })

    // Shape matches Home screen contact format: { _id, name, email, avatar }
    const result = uniqueUsers.map((u) => ({
      _id: u._id.toString(),
      name: u.name,
      email: u.email,
      phoneNumber: u.phoneNumber,
      avatar: u.avatar || null,
      isPhoneVerified: u.isPhoneVerified,
    }))

    console.log(`[findUsersByPhones] Checked ${safePhones.length} phones → found ${result.length} app users`)

    res.status(200).json({ success: true, data: result, count: result.length })
  } catch (error: any) {
    console.error('[findUsersByPhones] Error:', error)
    res.status(500).json({ success: false, msg: 'Server error fetching contacts' })
  }
}
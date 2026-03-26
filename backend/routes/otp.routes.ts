/***
 * routes/otp.routes.ts — Firebase Phone Authentication Routes
 * Fast2SMS /send and /verify routes removed.
 * One single endpoint: verify Firebase token → get app JWT.
 */
import express from 'express'
import { verifyFirebasePhone } from '../controller/otp.controller.js'

const router = express.Router()

// POST /api/otp/verify-firebase
router.post('/verify-firebase', verifyFirebasePhone)

export default router
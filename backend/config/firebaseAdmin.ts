/***
 * config/firebaseAdmin.ts — Firebase Admin SDK
 * Verifies Firebase tokens for free (no SMS cost)
 */
import admin from 'firebase-admin'

let adminInstance: admin.app.App | null = null

export const getFirebaseAdmin = (): admin.app.App => {
  if (adminInstance) return adminInstance

  if (admin.apps.length > 0) {
    adminInstance = admin.apps[0]!
    return adminInstance
  }

  const projectId   = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('[Firebase Admin] Missing env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY')
  }

  adminInstance = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      // .env stores \n as literal — convert back to real newlines
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  })

  console.log('[Firebase Admin] Initialized ✅')
  return adminInstance
}
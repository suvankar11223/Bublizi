/**
 * Environment Configuration & Validation
 * 
 * Validates required environment variables on startup
 * Provides type-safe config access
 */

import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
  'PORT',
] as const;

/**
 * Optional but recommended environment variables
 */
const RECOMMENDED_ENV_VARS = [
  'CLERK_SECRET_KEY',
  'GEMINI_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'FIREBASE_PROJECT_ID',
] as const;

/**
 * Validate environment variables
 */
export function validateEnv(): void {
  const missing: string[] = [];
  const recommended: string[] = [];

  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Check recommended variables
  for (const varName of RECOMMENDED_ENV_VARS) {
    if (!process.env[varName]) {
      recommended.push(varName);
    }
  }

  // Fail if required variables are missing
  if (missing.length > 0) {
    logger.error('Missing required environment variables', {
      missing,
      environment: process.env.NODE_ENV,
    });
    console.error('\n❌ FATAL: Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nPlease set these variables in your .env file\n');
    process.exit(1);
  }

  // Warn if recommended variables are missing
  if (recommended.length > 0) {
    logger.warn('Missing recommended environment variables', {
      recommended,
      environment: process.env.NODE_ENV,
    });
    console.warn('\n⚠️  Missing recommended environment variables:');
    recommended.forEach(v => console.warn(`   - ${v}`));
    console.warn('\nSome features may not work without these variables\n');
  }

  logger.info('Environment validation passed', {
    environment: process.env.NODE_ENV,
    requiredVars: REQUIRED_ENV_VARS.length,
    providedVars: REQUIRED_ENV_VARS.length - missing.length,
  });
}

/**
 * Environment-specific configuration
 */
export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  // Database
  database: {
    uri: process.env.MONGO_URI!,
    poolSize: parseInt(process.env.DB_POOL_SIZE || '50', 10),
    minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '5', 10),
  },

  // Redis
  redis: {
    url: process.env.UPSTASH_REDIS_URL,
    restUrl: process.env.UPSTASH_REDIS_REST_URL,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true',
  },

  // Authentication
  auth: {
    jwtSecret: process.env.JWT_SECRET!,
    clerkSecretKey: process.env.CLERK_SECRET_KEY,
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  },

  // Firebase
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },

  // External Services
  services: {
    geminiApiKey: process.env.GEMINI_API_KEY,
    cloudinaryUrl: process.env.CLOUDINARY_URL,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '600000', 10), // 10 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
} as const;

/**
 * Get config value safely
 */
export function getConfig<K extends keyof typeof config>(key: K): typeof config[K] {
  return config[key];
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: string): boolean {
  const envVar = `FEATURE_${feature.toUpperCase()}`;
  return process.env[envVar] === 'true';
}

/**
 * Get environment info for logging
 */
export function getEnvInfo() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    environment: config.env,
    port: config.port,
    isDevelopment: config.isDevelopment,
    isProduction: config.isProduction,
  };
}

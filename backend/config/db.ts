import mongoose from "mongoose";
import dotenv from "dotenv";
import { logger } from "../utils/logger.js";
import { retryWithBackoff } from "../utils/retry.js";

dotenv.config();

const connectDB = async (): Promise<void> => {
  try {
    // Enhanced connection options for production
    const options: mongoose.ConnectOptions = {
      maxPoolSize: process.env.NODE_ENV === 'production' ? 50 : 10, // Connection pool size
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true, // Automatically retry write operations
      retryReads: true, // Automatically retry read operations
      compressors: ['zlib'], // Enable compression for network traffic
      maxIdleTimeMS: 30000, // Close idle connections after 30s
      heartbeatFrequencyMS: 10000, // Check connection health every 10s
    };

    // Retry connection with exponential backoff
    await retryWithBackoff(
      async () => {
        await mongoose.connect(process.env.MONGO_URI as string, options);
      },
      {
        maxAttempts: 5,
        initialDelay: 2000,
        maxDelay: 30000,
        onRetry: (attempt, error) => {
          logger.warn('MongoDB connection retry', {
            attempt,
            error: error.message,
          });
        },
      }
    );

    logger.info('MongoDB connected successfully', {
      poolSize: options.maxPoolSize,
      minPoolSize: options.minPoolSize,
      environment: process.env.NODE_ENV,
      compression: 'enabled',
    });

    // Monitor connection events
    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error', {
        error: error.message,
        stack: error.stack,
      });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected', {
        timestamp: new Date().toISOString(),
      });
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected', {
        timestamp: new Date().toISOString(),
      });
    });

    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected event', {
        readyState: mongoose.connection.readyState,
      });
    });

    // Monitor connection pool
    setInterval(() => {
      const stats = {
        readyState: mongoose.connection.readyState,
        // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
        name: mongoose.connection.name,
        host: mongoose.connection.host,
      };
      
      logger.debug('MongoDB connection stats', stats);
    }, 60000); // Log every minute

  } catch (error: any) {
    logger.error('MongoDB connection failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

/**
 * Check database health
 */
export async function checkDBHealth(): Promise<boolean> {
  try {
    // Check if connected
    if (mongoose.connection.readyState !== 1) {
      return false;
    }
    
    // Ping database
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDBStats() {
  try {
    const stats = await mongoose.connection.db.stats();
    return {
      collections: stats.collections,
      dataSize: Math.round(stats.dataSize / 1024 / 1024) + 'MB',
      indexSize: Math.round(stats.indexSize / 1024 / 1024) + 'MB',
      objects: stats.objects,
    };
  } catch (error: any) {
    logger.error('Failed to get DB stats', { error: error.message });
    return null;
  }
}

/**
 * Graceful shutdown
 */
export async function disconnectDB(): Promise<void> {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed gracefully');
  } catch (error: any) {
    logger.error('Error closing MongoDB connection', {
      error: error.message,
    });
  }
}

// FIX #7: Handle process termination signals
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database connection');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing database connection');
  await disconnectDB();
  process.exit(0);
});

export default connectDB;

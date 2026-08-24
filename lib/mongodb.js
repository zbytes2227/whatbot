import mongoose from 'mongoose';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ module: 'mongodb' });

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections from growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToMongoDB() {
  const MONGODB_URI = process.env.MONGODB_URI?.trim();

  if (!MONGODB_URI) {
    const error = new Error('MONGODB_URI is not defined in environment variables');
    logger.error(error.message);
    throw error;
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // A dropped connection must not leave a stale cached connection behind.
  if (mongoose.connection.readyState === 0) {
    cached.conn = null;
  }

  if (!cached.promise) {
    const opts = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4, // Use IPv4, skip trying IPv6
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      logger.info('Connected to MongoDB');
      return m;
    }).catch((error) => {
      logger.error('MongoDB connection error', { err: error?.message || error });
      cached.promise = null;
      throw error;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    cached.conn = null;
    logger.error('MongoDB connection failed', { err: e?.message || e });
    throw e;
  }

  return cached.conn;
}

export default connectToMongoDB;

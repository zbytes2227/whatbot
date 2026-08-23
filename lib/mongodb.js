import mongoose from 'mongoose';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ module: 'mongodb' });

mongoose.set('bufferCommands', false);

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
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    logger.warn('MONGODB_URI is not defined in environment variables');
    return null;
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4, // Use IPv4, skip trying IPv6
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      logger.info('Connected to MongoDB');
      return m;
    }).catch((error) => {
      logger.warn('MongoDB connection error', { err: error?.message || error });
      cached.promise = null;
      return null;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    logger.warn('MongoDB connection failed', { err: e?.message || e });
    return null;
  }

  return cached.conn;
}

export default connectToMongoDB;

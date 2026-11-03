// pages/api/health.js
// Liveness/readiness probe. Intentionally reveals nothing sensitive.
import mongoose from 'mongoose';
import connectToMongoDB from '@/lib/mongodb';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let database = 'up';
  try {
    await Promise.race([
      connectToMongoDB(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    if (mongoose.connection.readyState !== 1) database = 'down';
  } catch {
    database = 'down';
  }
  // The process is alive even when the database is down; report degraded
  // instead of failing so orchestrators do not restart-loop the container.
  res.status(200).json({
    status: database === 'up' ? 'ok' : 'degraded',
    database,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

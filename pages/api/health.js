// pages/api/health.js
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
}

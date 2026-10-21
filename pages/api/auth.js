import { verifyAuth } from '@/lib/auth';

const handler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, valid: false, msg: 'Method not allowed.' });
  }

  try {
    const authResult = await verifyAuth(req);
    return res.status(200).json({
      success: true,
      valid: true,
      user: authResult.user,
    });
  } catch (error) {
    return res.status(error?.status || 401).json({
      success: false,
      valid: false,
      msg: error?.msg || 'Authentication required.',
    });
  }
};

export default handler;


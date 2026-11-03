import { clearedSessionCookies } from '@/lib/auth';
import { withApi } from '@/lib/api';

export default withApi(async (req, res) => {
  res.setHeader('Set-Cookie', clearedSessionCookies(req));
  return res.status(200).json({ success: true });
}, { methods: ['POST'], auth: false, db: false, name: 'logout' });

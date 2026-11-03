import { withApi } from '@/lib/api';

export default withApi(async (req, res, { user }) => {
  return res.status(200).json({ success: true, valid: true, user });
}, { methods: ['GET'], db: false, name: 'auth' });

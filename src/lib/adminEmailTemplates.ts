import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { EmailTemplateError } from './emailTemplates';
export async function requireEmailAdmin(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  const session = await getServerSession(req, res, authOptions as any) as any;
  if (!session?.user || session.user.role !== 'ADMIN') throw new EmailTemplateError('Administrator access required.', 403);
}
export function emailTemplateFailure(res: NextApiResponse, error: any) {
  if (error instanceof EmailTemplateError) return res.status(error.status).json({ error: error.message });
  if (error?.code === 'P2002' || error?.code === 'P2034') return res.status(409).json({ error: 'This template changed. Reload it before saving again.' });
  console.error('Email template request failed:', error);
  return res.status(500).json({ error: 'Unable to process the email template. Please try again.' });
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { emailTemplate, renderEmailTemplate, sampleEmailVariables, EmailTemplateError } from '@/lib/emailTemplates';
import { sendEmail } from '@/lib/mailer';
import { isEmailBlocked } from '@/lib/blockedEmails';
import { requireEmailAdmin, emailTemplateFailure } from '@/lib/adminEmailTemplates';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireEmailAdmin(req, res);
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
    const to = typeof req.body?.to === 'string' ? req.body.to.trim().toLowerCase() : '';
    if (to.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new EmailTemplateError('Enter a valid test recipient email.');
    if (await isEmailBlocked(to)) throw new EmailTemplateError('This test recipient is blocked.', 403);
    const def = emailTemplate(req.body?.id);
    const draft = { ...req.body, subject: `[TEST] ${req.body.subject}` };
    const rendered = renderEmailTemplate(def, draft, sampleEmailVariables(def));
    await sendEmail(to, rendered.subject, rendered.text, rendered.options);
    const mocked = !process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN || !process.env.MAILGUN_FROM_ADDRESS || (process.env.NODE_ENV !== 'production' && process.env.MAILGUN_FORCE_SEND !== 'true');
    return res.json({ ok: true, mocked });
  } catch (error) { return emailTemplateFailure(res, error); }
}

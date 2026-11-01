import type { NextApiRequest, NextApiResponse } from 'next';
import { emailTemplate, renderEmailTemplate, sampleEmailVariables } from '@/lib/emailTemplates';
import { requireEmailAdmin, emailTemplateFailure } from '@/lib/adminEmailTemplates';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireEmailAdmin(req, res);
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
    const def = emailTemplate(req.body?.id);
    const { subject, text, html } = renderEmailTemplate(def, req.body, sampleEmailVariables(def));
    return res.json({ subject, text, html });
  } catch (error) { return emailTemplateFailure(res, error); }
}

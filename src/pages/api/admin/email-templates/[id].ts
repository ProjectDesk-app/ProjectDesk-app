import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { emailTemplate, validateEmailTemplate, templateView, EmailTemplateError } from '@/lib/emailTemplates';
import { requireEmailAdmin, emailTemplateFailure } from '@/lib/adminEmailTemplates';
import { Prisma } from '@prisma/client';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireEmailAdmin(req, res);
    if (!['PUT', 'DELETE'].includes(req.method || '')) { res.setHeader('Allow', 'PUT, DELETE'); return res.status(405).end(); }
    const def = emailTemplate(typeof req.query.id === 'string' ? req.query.id : '');
    const version = req.body?.version;
    if (!Number.isSafeInteger(version) || version < 0) throw new EmailTemplateError('Reload this template before editing.');
    const draft = req.method === 'PUT' ? validateEmailTemplate(def, req.body) : null;
    const row = await prisma.$transaction(async tx => {
      const current = await tx.emailTemplateOverride.findUnique({ where: { id: def.id } });
      if ((current?.version ?? 0) !== version) throw new EmailTemplateError('This template changed. Reload it before saving again.', 409);
      if (!draft) {
        if (!current) return null;
        return tx.emailTemplateOverride.update({ where: { id: def.id }, data: { subject: def.subject, body: def.body, buttonLabel: def.buttonLabel ?? null, isCustomized: false, version: { increment: 1 } } });
      }
      return tx.emailTemplateOverride.upsert({ where: { id: def.id }, create: { id: def.id, ...draft, isCustomized: true }, update: { ...draft, isCustomized: true, version: { increment: 1 } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.json({ template: templateView(def, row) });
  } catch (error) { return emailTemplateFailure(res, error); }
}

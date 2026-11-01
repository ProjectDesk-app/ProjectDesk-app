import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { emailTemplateCatalog } from '@/lib/emailTemplates/catalog';
import { templateView } from '@/lib/emailTemplates';
import { requireEmailAdmin, emailTemplateFailure } from '@/lib/adminEmailTemplates';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireEmailAdmin(req, res);
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
    const overrides = await prisma.emailTemplateOverride.findMany();
    const byId = new Map(overrides.map(row => [row.id, row]));
    return res.json({ templates: emailTemplateCatalog.map(def => templateView(def, byId.get(def.id))) });
  } catch (error) { return emailTemplateFailure(res, error); }
}

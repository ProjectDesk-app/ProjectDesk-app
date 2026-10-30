import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { feedbackUser, feedbackFailure, FeedbackError, text, dayCount } from '@/lib/feedback';
const defaults = [{ name: 'Ethics Document', minDays: 2, maxDays: 5 }, { name: 'Thesis', minDays: 5, maxDays: 10 }, { name: 'Other', minDays: null, maxDays: null }];
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await feedbackUser(req, res, true);
    if (!['GET', 'PUT'].includes(req.method || '')) { res.setHeader('Allow', 'GET, PUT'); return res.status(405).end(); }
    let settings = await prisma.feedbackSettings.findUnique({ where: { userId: user.id } });
    // Settings row is the once-only initialisation marker, including when presets are later removed.
    if (!settings) await prisma.$transaction(async tx => {
      await tx.feedbackSettings.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
      await tx.feedbackPreset.createMany({ data: defaults.map(p => ({ ...p, supervisorId: user.id })), skipDuplicates: true });
    });
    if (req.method === 'PUT') {
      const body = req.body || {};
      if (body.dailySummaryEnabled !== undefined && typeof body.dailySummaryEnabled !== 'boolean') throw new FeedbackError('Invalid summary preference.');
      const presets = body.presets === undefined ? undefined : body.presets;
      if (presets !== undefined && (!Array.isArray(presets) || presets.length > 100)) throw new FeedbackError('Provide up to 100 work-type presets.');
      const validated = presets?.map((p: any) => {
        const name = text(p.name, 'Preset name', 100), minDays = p.minDays == null ? null : dayCount(p.minDays), maxDays = p.maxDays == null ? null : dayCount(p.maxDays);
        if ((minDays === null) !== (maxDays === null) || (minDays !== null && maxDays < minDays)) throw new FeedbackError('Provide both estimate limits in order, or leave both blank.');
        return { name, minDays, maxDays, supervisorId: user.id };
      });
      if (validated && new Set(validated.map((p: any) => p.name.toLowerCase())).size !== validated.length) throw new FeedbackError('Preset names must be unique.');
      await prisma.$transaction(async tx => {
        if (body.dailySummaryEnabled !== undefined) await tx.feedbackSettings.update({ where: { userId: user.id }, data: { dailySummaryEnabled: body.dailySummaryEnabled } });
        if (validated) { await tx.feedbackPreset.deleteMany({ where: { supervisorId: user.id } }); if (validated.length) await tx.feedbackPreset.createMany({ data: validated }); }
      });
    }
    settings = await prisma.feedbackSettings.findUnique({ where: { userId: user.id } });
    return res.json({ dailySummaryEnabled: settings!.dailySummaryEnabled, presets: await prisma.feedbackPreset.findMany({ where: { supervisorId: user.id }, orderBy: { id: 'asc' } }) });
  } catch (error) { return feedbackFailure(res, error); }
}

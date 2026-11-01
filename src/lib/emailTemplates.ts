import { prisma } from '@/lib/prisma';
import { sendEmail, renderEmailHtml, EmailOptions } from '@/lib/mailer';
import { emailTemplateCatalog } from './emailTemplates/catalog';
import type { EmailTemplateDefinition, EmailTemplateDraft } from './emailTemplates/types';

export class EmailTemplateError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function emailTemplate(id: string): EmailTemplateDefinition {
  const definition = emailTemplateCatalog.find(template => template.id === id);
  if (!definition) throw new EmailTemplateError('Email template not found.', 404);
  return definition;
}
const tokens = (text: string) => Array.from(text.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g), match => match[1]);
export function validateEmailTemplate(def: EmailTemplateDefinition, input: EmailTemplateDraft): EmailTemplateDraft {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EmailTemplateError('Provide valid template wording.');
  if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 300 || /[\r\n]/.test(input.subject)) throw new EmailTemplateError('Enter a subject of up to 300 characters on one line.');
  if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 20000) throw new EmailTemplateError('Enter body wording of up to 20,000 characters.');
  const all = `${input.subject}\n${input.body}`;
  const stripped = all.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, '');
  if (stripped.includes('{{') || stripped.includes('}}')) throw new EmailTemplateError('A placeholder is incomplete. Use the listed {{placeholders}}.');
  const keys = tokens(all);
  for (const key of keys) if (key !== 'action' && !Object.hasOwn(def.variables, key)) throw new EmailTemplateError(`Unknown placeholder: {{${key}}}.`);
  if (tokens(input.subject).includes('action')) throw new EmailTemplateError('The button placeholder belongs in the body, not the subject.');
  for (const key of def.requiredVariables || []) if (!keys.includes(key)) throw new EmailTemplateError(`Keep the required {{${key}}} placeholder.`);
  if (def.buttonUrlVariable) {
    if (tokens(input.body).filter(key => key === 'action').length !== 1) throw new EmailTemplateError('Keep exactly one {{action}} placeholder for the protected button.');
    if (keys.includes(def.buttonUrlVariable)) throw new EmailTemplateError('Use {{action}} for the protected link instead of its destination placeholder.');
    if (typeof input.buttonLabel !== 'string' || !input.buttonLabel.trim() || input.buttonLabel.length > 60 || /[\r\n]/.test(input.buttonLabel)) throw new EmailTemplateError('Enter a button label of up to 60 characters on one line.');
  } else if (keys.includes('action')) throw new EmailTemplateError('This notification has no action button.');
  return { subject: input.subject.trim(), body: input.body.trim(), buttonLabel: def.buttonUrlVariable ? input.buttonLabel!.trim() : null };
}
export function renderEmailTemplate(def: EmailTemplateDefinition, draft: EmailTemplateDraft, values: Record<string, string | number>) {
  const valid = validateEmailTemplate(def, draft);
  let options: EmailOptions = {};
  if (def.buttonUrlVariable) {
    const value = values[def.buttonUrlVariable];
    if (typeof value !== 'string') throw new EmailTemplateError('The protected button destination is missing.');
    let url: URL; try { url = new URL(value); } catch { throw new EmailTemplateError('The button destination must be a complete web address.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new EmailTemplateError('The button destination must use HTTP or HTTPS without embedded credentials.');
    options = { action: { label: valid.buttonLabel!, url: value } };
  }
  const fill = (text: string) => text.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_match, key) => {
    if (key === 'action') return `${options.action!.label}:\n${options.action!.url}`;
    if (!Object.hasOwn(values, key)) throw new EmailTemplateError(`Missing value for {{${key}}}.`);
    return String(values[key]);
  });
  const subject = fill(valid.subject).replace(/[\r\n]+/g, ' ').slice(0, 300), text = fill(valid.body);
  return { subject, text, html: renderEmailHtml(subject, text, options), options };
}
export function templateView(def: EmailTemplateDefinition, override?: any) {
  const content = override?.isCustomized === false ? null : override;
  return {
    id: def.id, name: def.name, category: def.category, description: def.description,
    subject: content?.subject ?? def.subject, body: content?.body ?? def.body,
    buttonLabel: content?.buttonLabel ?? def.buttonLabel ?? null, hasButton: Boolean(def.buttonUrlVariable),
    variables: Object.entries(def.variables).filter(([key]) => key !== def.buttonUrlVariable).map(([key, value]) => ({ key, ...value })),
    requiredVariables: [...(def.requiredVariables || []), ...(def.buttonUrlVariable ? ['action'] : [])],
    isCustomized: Boolean(content), version: override?.version ?? 0,
  };
}
export function sampleEmailVariables(def: EmailTemplateDefinition) { return Object.fromEntries(Object.entries(def.variables).map(([key, value]) => [key, value.sample])); }
export async function sendTemplatedEmail(to: string, id: string, values: Record<string, string | number>) {
  const def = emailTemplate(id);
  const stored = await prisma.emailTemplateOverride.findUnique({ where: { id } });
  const override = stored?.isCustomized === false ? null : stored;
  const draft = { subject: override?.subject ?? def.subject, body: override?.body ?? def.body, buttonLabel: override?.buttonLabel ?? def.buttonLabel };
  const rendered = renderEmailTemplate(def, draft, values);
  await sendEmail(to, rendered.subject, rendered.text, rendered.options);
}

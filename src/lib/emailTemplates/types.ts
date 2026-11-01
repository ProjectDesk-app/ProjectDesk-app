export type EmailTemplateDefinition = {
  id: string;
  name: string;
  category: string;
  description: string;
  subject: string;
  body: string;
  buttonLabel?: string;
  buttonUrlVariable?: string;
  variables: Record<string, {label: string; sample: string}>;
  requiredVariables?: string[];
};
export type EmailTemplateDraft = { subject: string; body: string; buttonLabel?: string | null };

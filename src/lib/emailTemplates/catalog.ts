import { accountTemplates } from './account';
import { feedbackTemplates } from './feedback';
import { projectTemplates } from './project';
import { activityTemplates } from './activity';
import type { EmailTemplateDefinition } from './types';
export const emailTemplateCatalog: EmailTemplateDefinition[] = [...accountTemplates, ...feedbackTemplates, ...projectTemplates, ...activityTemplates];

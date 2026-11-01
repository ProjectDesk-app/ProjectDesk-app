import type { EmailTemplateDefinition } from './types';

const reviewVariables = {
  recipientName: { label: 'Recipient name', sample: 'Alex Student' },
  workTitle: { label: 'Work title', sample: 'Ethics Submission' },
  version: { label: 'Draft version', sample: '1' },
  supervisorName: { label: 'Supervisor name', sample: 'Dr Taylor' },
  estimatedRange: { label: 'Estimated feedback return', sample: '3rd – 6th November 2026' },
  actionUrl: { label: 'Protected tracking link', sample: 'https://example.org/feedback/track/example' },
};
const { estimatedRange: _estimatedRange, ...completionVariables } = reviewVariables;
export const feedbackTemplates: EmailTemplateDefinition[] = [
  {
    id: 'feedback_received', name: 'Feedback received', category: 'Feedback Hub', description: 'Sent when a supervisor records a new draft for review.',
    subject: 'Work received: {{workTitle}} (V{{version}})',
    body: 'Hello {{recipientName}},\n\nYour work has been received and queued for review.\n\n{{workTitle}} — V{{version}}\nSupervisor: {{supervisorName}}\nEstimated feedback return: {{estimatedRange}}\n\n{{action}}\n\nSign in with this email address for your full review history.',
    buttonLabel: 'Track Progress', buttonUrlVariable: 'actionUrl', variables: reviewVariables, requiredVariables: ['workTitle', 'version', 'estimatedRange'],
  },
  {
    id: 'feedback_completed', name: 'Feedback returned', category: 'Feedback Hub', description: 'Sent once per version after the supervisor confirms feedback has been returned.',
    subject: 'Feedback returned: {{workTitle}} (V{{version}})',
    body: 'Hello {{recipientName}},\n\nYour supervisor has confirmed that your feedback has been returned separately.\n\n{{workTitle}} — V{{version}}\nSupervisor: {{supervisorName}}\n\n{{action}}\n\nSign in with this email address for your full review history.',
    buttonLabel: 'Track Progress', buttonUrlVariable: 'actionUrl', variables: completionVariables, requiredVariables: ['workTitle', 'version'],
  },
  {
    id: 'feedback_estimate_updated', name: 'Feedback return estimate changed', category: 'Feedback Hub', description: 'Sent when a supervisor changes the estimate and chooses to notify the recipient.',
    subject: 'Feedback estimate updated: {{workTitle}}',
    body: 'Hello {{recipientName}},\n\nYour estimated feedback return for {{workTitle}} (V{{version}}) is now {{estimatedRange}}.\n\n{{action}}',
    buttonLabel: 'Track Progress', buttonUrlVariable: 'actionUrl', variables: reviewVariables, requiredVariables: ['workTitle', 'version', 'estimatedRange'],
  },
  {
    id: 'feedback_update_requested', name: 'Overdue feedback update request', category: 'Feedback Hub', description: 'Sent to a supervisor when a recipient requests an overdue update.',
    subject: 'Feedback update requested: {{workTitle}}',
    body: '{{recipientName}} has requested an update on overdue feedback for {{workTitle}} (V{{version}}).\n\nEstimated return: {{estimatedRange}}.\n\n{{action}}',
    buttonLabel: 'Open Feedback Hub', buttonUrlVariable: 'actionUrl', variables: { ...reviewVariables, actionUrl: { label: 'Protected Feedback Hub link', sample: 'https://example.org/feedback' } }, requiredVariables: ['recipientName', 'workTitle', 'version', 'estimatedRange'],
  },
  {
    id: 'feedback_daily_summary', name: 'Outstanding feedback summary', category: 'Feedback Hub', description: 'Opt-in supervisor summary of outstanding reviews, ordered by due date.',
    subject: 'Feedback Hub: {{outstandingCount}} outstanding {{reviewNoun}}',
    body: 'Good morning {{recipientName}},\n\nYour outstanding feedback, earliest due first:\n\n{{summary}}\n\n{{action}}',
    buttonLabel: 'Open Feedback Hub', buttonUrlVariable: 'actionUrl',
    variables: { recipientName: reviewVariables.recipientName, outstandingCount: { label: 'Outstanding review count', sample: '2' }, reviewNoun: { label: 'Review singular/plural', sample: 'reviews' }, summary: { label: 'Outstanding review list', sample: 'Alex Student: Ethics Submission (V1)\nInitial Reading · Estimated return 3rd – 6th November 2026' }, actionUrl: { label: 'Protected Feedback Hub link', sample: 'https://example.org/feedback' } }, requiredVariables: ['outstandingCount', 'summary'],
  },
];

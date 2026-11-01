import type { EmailTemplateDefinition } from './types';

const recipient = { recipientName: { label: 'Recipient name', sample: 'Alex Student' } };
const action = { actionUrl: { label: 'Protected action link', sample: 'https://example.org/verify-email?token=example-preview-only' } };
const reference = { reference: { label: 'Support reference', sample: 'T-EXAMPLE' } };
const noReply = 'Please do not reply to this email. This address is used for notifications only and is not monitored.';

export const accountTemplates: EmailTemplateDefinition[] = [
  {
    id: 'account.verify', name: 'Verify account email', category: 'Account', description: 'Email verification when someone tries to sign in before verification.',
    subject: 'Verify your ProjectDesk account', body: 'Hello {{recipientName}},\n\nPlease confirm your email address to finish setting up your ProjectDesk account.\n\n{{action}}\n\nIf you did not request this, you can ignore this message.',
    buttonLabel: 'Verify Email', buttonUrlVariable: 'actionUrl', variables: { ...recipient, ...action },
  },
  {
    id: 'account.activate', name: 'Activate invited account', category: 'Account', description: 'Confirms the email address after an invited user sets a password.',
    subject: 'Activate your ProjectDesk account', body: 'Hello {{recipientName}},\n\nWelcome to ProjectDesk! Please verify your email address to activate your account.\n\n{{action}}\n\nIf you did not sign up, you can safely ignore this message.',
    buttonLabel: 'Activate Account', buttonUrlVariable: 'actionUrl', variables: { ...recipient, ...action },
  },
  {
    id: 'account.email-change', name: 'Confirm changed email address', category: 'Account', description: 'Verification sent to a requested replacement email address.',
    subject: 'Confirm your new ProjectDesk email', body: 'Hello {{recipientName}},\n\nPlease confirm your new ProjectDesk email address.\n\n{{action}}\n\nIf you did not request this change, please ignore this message.',
    buttonLabel: 'Confirm Email', buttonUrlVariable: 'actionUrl', variables: { ...recipient, ...action },
  },
  {
    id: 'account.password-reset', name: 'Password reset link', category: 'Account', description: 'One-time password reset link requested by an account holder.',
    subject: 'Reset your ProjectDesk password', body: 'Hello {{recipientName}},\n\nYou requested to reset your ProjectDesk password. Use the one-time link below to choose a new password.\n\n{{action}}\n\nIf you did not request this change, you can ignore this message.',
    buttonLabel: 'Reset Password', buttonUrlVariable: 'actionUrl', variables: { ...recipient, ...action },
  },
  {
    id: 'account.admin-reset', name: 'Administrator password reset notice', category: 'Account', description: 'Directs the user to request a secure reset after an administrator prompts them.',
    subject: 'Reset your ProjectDesk password', body: 'Hello {{recipientName}},\n\nAn administrator requested a password reset for your ProjectDesk account. Visit the password reset page to request a secure link and choose a new password.\n\n{{action}}\n\nIf you did not expect this change, contact support.',
    buttonLabel: 'Request Password Reset', buttonUrlVariable: 'actionUrl', variables: { ...recipient, ...action },
  },
  {
    id: 'account.invitation', name: 'Account invitation', category: 'Account', description: 'Invitation issued by an administrator to an approved email address.',
    subject: "You've been invited to ProjectDesk", body: "Hello {{recipientName}},\n\nYou've been invited to join ProjectDesk. Set your password and activate your account using the email address that received this invitation.\n\n{{action}}",
    buttonLabel: 'Set Up Account', buttonUrlVariable: 'actionUrl', variables: { ...recipient, ...action },
  },
  {
    id: 'account.feedback-verify', name: 'Feedback Hub email verification', category: 'Account', description: 'Verifies a free recipient account created from a feedback tracking link.',
    subject: 'Verify your email for Feedback Hub', body: 'Hello {{recipientName}},\n\nPlease verify your email address to see your full feedback history.\n\n{{action}}\n\nFeedback tracking is free. Your drafts and feedback are exchanged directly with your supervisor.\n\nIf you did not create this account, you can ignore this message.',
    buttonLabel: 'Verify Email', buttonUrlVariable: 'actionUrl', variables: { ...recipient, ...action },
  },
  {
    id: 'account.request-admin', name: 'Account access request', category: 'Account', description: 'Notifies the administrator about a request to join ProjectDesk.',
    subject: 'ProjectDesk account request', body: 'A new request for a ProjectDesk account has been submitted.\n\nName: {{requesterName}}\nEmail: {{requesterEmail}}\nRequested role: {{requestedRole}}\nRequested: {{requestedAt}}\nAccount status: {{accountStatus}}\n{{existingAccountDetails}}\n\nReason for access:\n{{context}}\n\nInvite this user from the Admin area if access should be granted.\n\n{{action}}',
    buttonLabel: 'Review Account Request', buttonUrlVariable: 'actionUrl', requiredVariables: ['requesterName', 'requesterEmail', 'requestedRole', 'context'],
    variables: { ...action, requesterName: { label: 'Requester name', sample: 'Alex Student' }, requesterEmail: { label: 'Requester email', sample: 'alex@example.org' }, requestedRole: { label: 'Requested role', sample: 'STUDENT' }, requestedAt: { label: 'Request date and time', sample: '1 Nov 2026, 09:30' }, accountStatus: { label: 'Account status', sample: 'No account' }, existingAccountDetails: { label: 'Existing account details', sample: 'Current role: STUDENT\nCurrent subscription type: SPONSORED' }, context: { label: 'Reason for access', sample: 'I would like to track my research project.' } },
  },
  {
    id: 'account.activation-admin', name: 'Invited account activated', category: 'Account', description: 'Tells the administrator when an invited user has activated their account.',
    subject: '[ProjectDesk] Invited {{role}} activation', body: 'An invited user has activated their ProjectDesk account.\n\n{{accountDetails}}\n\nReview this account in the Admin Dashboard if needed.\n\n{{action}}',
    buttonLabel: 'View Admin Dashboard', buttonUrlVariable: 'actionUrl', requiredVariables: ['accountDetails'],
    variables: { ...action, role: { label: 'Account role', sample: 'student' }, accountDetails: { label: 'Activated account details', sample: 'Name: Alex Student\nEmail: alex@example.org\nRole: STUDENT\nSubscription type: SPONSORED' } },
  },
  {
    id: 'sponsorship.approved', name: 'Sponsorship approved', category: 'Sponsorship', description: 'Confirms that a supervisor or administrator has approved account sponsorship.',
    subject: 'ProjectDesk sponsorship approved', body: 'Hello {{recipientName}},\n\n{{approver}} has approved your sponsorship on ProjectDesk. You can now sign in and access your projects.\n\n{{action}}',
    buttonLabel: 'Open ProjectDesk', buttonUrlVariable: 'actionUrl', variables: { ...recipient, ...action, approver: { label: 'Approver description', sample: 'Your supervisor' } },
  },
  {
    id: 'sponsorship.declined', name: 'Sponsorship declined', category: 'Sponsorship', description: 'Notifies a recipient when their sponsorship request is declined.',
    subject: 'ProjectDesk sponsorship request update', body: 'Hello {{recipientName}},\n\nYour supervisor declined the sponsorship request for ProjectDesk. Please reach out to them if this was unexpected.',
    variables: { ...recipient },
  },
  {
    id: 'sponsorship.action-needed', name: 'Sponsor action needed', category: 'Sponsorship', description: 'An affected recipient asks their sponsor to restore access.',
    subject: 'ProjectDesk sponsorship action needed', body: "Hello {{recipientName}},\n\n{{studentName}} ({{studentEmail}}) tried to sign in to ProjectDesk, but your sponsor subscription is currently inactive.\n\nPlease restart your subscription or add them again once billing is active so they can continue working.\n\n{{action}}\n\nIf this wasn't expected, you can ignore this message.",
    buttonLabel: 'Review Sponsorship', buttonUrlVariable: 'actionUrl', requiredVariables: ['studentName', 'studentEmail'],
    variables: { ...recipient, ...action, studentName: { label: 'Affected user name', sample: 'Alex Student' }, studentEmail: { label: 'Affected user email', sample: 'alex@example.org' } },
  },
  {
    id: 'support.contact-admin', name: 'New contact request', category: 'Support', description: 'Sends a public contact form submission to the support team.',
    subject: 'Contact request: {{topic}} # Ref: {{reference}}', body: 'Reference: {{reference}}\nName: {{requesterName}}\nEmail: {{requesterEmail}}\nType: {{topic}}\n\n{{description}}',
    requiredVariables: ['reference', 'requesterName', 'requesterEmail', 'topic', 'description'],
    variables: { ...reference, requesterName: { label: 'Requester name', sample: 'Alex Student' }, requesterEmail: { label: 'Requester email', sample: 'alex@example.org' }, topic: { label: 'Contact type', sample: 'General enquiry' }, description: { label: 'Request text', sample: 'I have a question about using ProjectDesk.' } },
  },
  {
    id: 'support.contact-confirmation', name: 'Contact request confirmation', category: 'Support', description: 'Acknowledges receipt of a public contact form submission.',
    subject: 'We received your request ({{reference}})', body: `Hello {{recipientName}},\n\nThanks for contacting ProjectDesk support. We've received your request and will get back to you soon.\n\nReference: {{reference}}\nTopic: {{topic}}\n\n${noReply}`,
    requiredVariables: ['reference'], variables: { ...recipient, ...reference, topic: { label: 'Contact type', sample: 'General enquiry' } },
  },
  {
    id: 'support.ticket-admin', name: 'New support ticket', category: 'Support', description: 'Sends an authenticated user support request to the support team.',
    subject: 'Support ticket {{reference}}: {{title}}', body: 'Reference: {{reference}}\nReporter: {{requesterName}}\nEmail: {{requesterEmail}}\n\n{{description}}',
    requiredVariables: ['reference', 'requesterName', 'requesterEmail', 'description'], variables: { ...reference, title: { label: 'Ticket title', sample: 'Help with my project' }, requesterName: { label: 'Reporter name', sample: 'Alex Student' }, requesterEmail: { label: 'Reporter email', sample: 'alex@example.org' }, description: { label: 'Ticket description', sample: 'I need help finding a project task.' } },
  },
  {
    id: 'support.ticket-confirmation', name: 'Support ticket confirmation', category: 'Support', description: 'Acknowledges a signed-in user support ticket.',
    subject: "We've logged your ticket ({{reference}})", body: `Hello {{recipientName}},\n\nYour support ticket has been received. We'll be in touch shortly.\n\nReference: {{reference}}\nSubject: {{title}}\n\n${noReply}`,
    requiredVariables: ['reference'], variables: { ...recipient, ...reference, title: { label: 'Ticket title', sample: 'Help with my project' } },
  },
];

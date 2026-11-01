# Email Centre

Administrators can open **Admin → Email templates** (`/admin/email-templates`). Templates, Test delivery, and Delivery logs share navigation. All application notification email call sites use the central catalogue; the ad-hoc delivery tester remains free-form.

## Editing and previews

- Edit a subject, plain-text body wording, and the primary button label. The shared branded HTML layout and app-generated date formatting remain controlled by code.
- Insert the listed `{{placeholders}}` for real names, document titles, dates, references, and event details. Unknown or malformed placeholders are rejected. Required placeholders cannot be removed.
- Every action template keeps exactly one `{{action}}` placeholder. Its destination is supplied by the application, such as the correct tracking token or verification link. Administrators can move the button or rename its label; they cannot edit its destination in this editor.
- Desktop/mobile previews use fictional sample data and reserved example.org links. They use the same renderer as actual email; they do not create accounts, reviews, password resets, or invitations.
- Save applies custom wording to future sends across the app. It does not change emails already delivered. Reset restores the current code default and retains a revision marker so an old editor cannot overwrite a newer save.
- Test sends are explicit, accept an administrator-entered recipient, use the current unsaved draft with sample data, and prefix the subject with `[TEST]`. Test emails use the existing Mailgun setup and appear in delivery logs. Development/mock delivery is identified in the response.

## Catalogue

The catalogue includes 27 templates across Account, Sponsorship, Support, Projects, Activity notifications, and Feedback Hub. Activity and summary templates expose app-generated event/list text as protected placeholders; editing a wrapper does not alter recipient selection, notification preferences, due-date calculation, or email frequency. Summaries retain per-item links alongside their primary action button.

Receipt, completion and revised-estimate feedback emails share the Track Progress button. Estimates use ordinal British date ranges, including month and year changes, for example `3rd – 6th November 2026` or `29th November – 3rd December 2026`.

## Deployment

1. Apply `20261101190000_email_templates` using `npx prisma migrate deploy` against the intended database, then regenerate the Prisma client and deploy the application.
2. Open Email Centre as an administrator. Defaults are available without seeding; only saved overrides are stored in the database.
3. Preview Feedback return estimate changed and verify the readable dates and Track Progress button. Optionally send a test to an address you control.
4. Test a genuine revised estimate in a staging review. Existing live deployments will continue to send the old format until the new application code is deployed.

No new Mailgun credentials or scheduler settings are required. Existing notification permissions, preference rules, recipients and email logs remain in use. No live emails or database migrations are performed by local checks.

Validation: `npm run test:emails`, `node --test scripts/*.test.cjs`, `npx tsc --noEmit --incremental false`, `npx prisma validate`, and `npm run build`.

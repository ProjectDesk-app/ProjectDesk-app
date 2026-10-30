# Project notifications and scheduled status checks

The project status calculator runs after task changes and automatically at **1 am Europe/London time on working days**. Working days exclude weekends and England and Wales bank holidays, using the same holiday service as Feedback Hub. The scheduled check updates active, unarchived projects without requiring anyone to visit their pages.

## Behaviour

- Status alerts are generated only when a project changes into **Behind Schedule**, **At Risk**, or **Danger**. They explain the cause and link to the project tasks. Unchanged states, returning to On Track, Not Started, and Completed generate no status alerts.
- All `COMPLETE`, `DONE`, and `COMPLETED` task labels mean finished. Finished tasks are excluded from every overdue and project-end check.
- Existing precedence is retained: work scheduled beyond the project end causes Danger; two or more unfinished tasks past their deadlines cause At Risk; otherwise an unfinished task over 24 hours overdue causes Behind Schedule. A single just-overdue task retains the existing 24-hour grace period.
- The project's supervisor, students, collaborators and explicit members receive the status notification. Their account preferences determine immediate email, daily email, or in-app only. The automated supervisor actor does not suppress the supervisor's own alert.
- Task assignments, reassignments and deadline changes are in-app only. New comments and assistance flags follow account email preferences. Removing a flag, editing a comment, and a user's own actions do not email that user.
- The **9 am working-day digest** combines email notifications deferred to a summary and task deadline reminders. Students/collaborators see their assigned work; supervisors receive an overview across their projects. Completed tasks and completed or archived projects are excluded.

## Deployment

1. Apply the new notification migration and regenerate the Prisma client before deploying these routes.
2. Configure the existing `CRON_SECRET` on the application. In GitHub Actions repository secrets, use the same `CRON_SECRET` and add `PROJECT_NOTIFICATIONS_CRON_URL` containing the application's full `/api/cron/project-notifications` URL, without a query string.
3. Push `.github/workflows/project-notifications.yml` to the default branch and enable Actions. It invokes the status job at 00:00 and 01:00 UTC, and the digest job at 08:00 and 09:00 UTC, weekdays only. The application accepts only the matching 01:00 or 09:00 UK hour, handling GMT/BST automatically and skipping bank holidays.
4. A manual Actions run is available with a status/digest selector, but it still respects working days and the UK time window. A successful run outside the window reports `skipped`, rather than sending or recalculating.

GitHub scheduled jobs can start late; use a dedicated scheduler against the same endpoint if precise timing is required. Send `Authorization: Bearer <CRON_SECRET>` and select `?job=status` or `?job=digest`. Do not expose the secret in URLs or application logs.

A database job record deduplicates each job and UK date. Status checks claim a 30-minute lease so a crashed batch can be retried; each individual status transition and notification outbox enqueue is committed in one transaction. Concurrent updates use a prior-version check. Failed batches return HTTP 503 and release their job claim; reruns do not re-announce already saved transitions. Email delivery has its own claims and deduplication; a process dying after provider acceptance needs operational investigation rather than blind resend.

## Verification

Run `node --test scripts/project-status-notifications.test.cjs` for completion handling, grace periods and precedence, transition alerts, recovery silence, ownership recipients, scheduler authentication, working days, GMT/BST, batch deduplication and retry behaviour. Before enabling on production, test with a staging project and mail account. Notification preferences are available under **My Account → Notification preferences**.

# Feedback Hub

Feedback Hub is independent of projects and stores review tracking, not draft files or feedback documents. Supervisors with existing active access manage reviews at `/feedback`. Verified recipients see all reviews matching their current email, without paying or needing sponsorship.

## Release setup

1. Apply the checked-in migration with `npx prisma migrate deploy` in the deployment environment, then generate the Prisma client and deploy the application. The migration adds feedback tables and the default-false `User.feedbackOnly` flag; it does not alter existing project records.
2. Configure the existing Mailgun delivery settings and `NEXTAUTH_URL` with the real application origin. In development, the existing mailer mocks delivery unless force-send is explicitly enabled. Review email failures in the existing admin email log.
3. Set a strong `CRON_SECRET` in the application environment. Set repository Actions secrets `CRON_SECRET` to the same value and `FEEDBACK_CRON_URL` to `https://YOUR_APP_HOST/api/feedback/cron`. The included workflow calls at 08:00 and 09:00 UTC on weekdays; the endpoint only sends during London's 09:00 hour, including daylight saving changes. Supervisors must opt in under Hub settings.
4. Enable GitHub Actions scheduled workflows on the default branch. GitHub schedules may be delayed: for precise 09:00 delivery, use a production scheduler calling the same endpoint with `Authorization: Bearer <CRON_SECRET>`. The endpoint deduplicates by supervisor and UK date and skips holidays, weekends, empty queues, and ineligible supervisors. Do not run a second scheduler unless the existing deduplication behaviour is intended.

No production migration, deployment, or repository-secret changes are performed by the local implementation.

## Review behaviour

- Each work record belongs to one supervisor and recipient email. Add next version retains the work grouping and allocates a distinct version, status, dates, token, history, and turnaround record. If earlier versions remain active, the supervisor explicitly keeps them or cancels them as superseded.
- Receipt dates default to today and may be backdated. Working-day ranges start counting after receipt, exclude weekends and [England and Wales bank holidays](https://www.gov.uk/bank-holidays.json), and use Europe/London dates. Holiday data is cached; calculations refuse dates outside published coverage. An unavailable calendar does not hide existing records.
- Stages can move forwards or backwards. Reopening a terminal review requires confirmation. Completing means feedback has already been returned externally. Cancellation retains its reason and history and sends no email.
- Receipt and completion emails are claimed atomically. Completion is sent at most once per version, including after reopening. Failed provider calls release the claim for an explicit supervisor retry. As with any external provider, a process interruption between delivery and recording success requires operational investigation; claims are not automatically expired to avoid duplicate sends.
- Revised estimates retain old and new dates in history. Supervisors choose whether to email the change.
- An overdue review is an active review whose latest return date has passed in UK time. A verified matching recipient can request an emailed update every five working days. Failed reminder delivery releases the cooldown for retry.
- Public tracking links are long random non-expiring tokens. Public responses omit recipient identity, email, detailed history, and internal identifiers, and disable caching/indexing. Anyone holding a link can see its basic review details: treat it as private correspondence.
- New recipient registrations require a valid tracking token, matching email, and email verification. They grant Feedback Hub access only; middleware blocks unrelated workspace pages/APIs. Existing accounts keep their existing access. Email matching uses the verified current account email, so changing it changes which reviews appear.

## Validation

Run `node --test scripts/feedback*.test.cjs scripts/task-set-schedule.test.cjs`, `npx tsc --noEmit --incremental false`, `npx prisma validate`, and `npm run build`.

Before rollout, use a staging database and mail account to walk through receipt → stage changes → estimate revision → overdue request → completion → reopen → completion again; confirm only one completion email. Check V2/V3 grouping, recipient registration and verification, cancellation, correction of an email address, expired supervisor access, unrelated-account denial, and a summary invocation during London's 09:00 hour. Confirm the migration is applied before exposing Hub routes.

## Queue position

The tracker and signed-in review list show a review's position among all of its supervisor's outstanding reviews, including those already being read. Completed and cancelled versions leave the queue. Only the position, total, and number ahead are visible to recipients; other work titles and recipients are never disclosed.

Default order is received date, then record creation time, then record ID to break ties. Supervisors can move an active review to a chosen position under review details. This preserves a manual order for the current queue; newly added or reopened reviews follow that manual queue in receipt-date order. “Restore receipt-date order” removes the manual ordering for the active queue. Position changes do not change feedback estimates or send emails. Tracking pages and signed-in lists refresh every minute.

The queue enhancement has its own migration, `20261030130000_feedback_queue`. Apply it with `npx prisma migrate deploy` before deploying this version, even if the original Feedback Hub migration was already applied. It adds a nullable position field; existing reviews automatically use receipt-date order.

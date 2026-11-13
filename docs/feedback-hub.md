# Feedback Hub

Feedback Hub is independent of projects and stores review tracking, not draft files or feedback documents. Supervisors with existing active access manage reviews at `/feedback`. Verified recipients see all reviews matching their current email, without paying or needing sponsorship.

## Release setup

1. Apply the checked-in migration with `npx prisma migrate deploy` in the deployment environment, then generate the Prisma client and deploy the application. The migration adds feedback tables and the default-false `User.feedbackOnly` flag; it does not alter existing project records.
2. Configure the existing Mailgun delivery settings and `NEXTAUTH_URL` with the real application origin. In development, the existing mailer mocks delivery unless force-send is explicitly enabled. Review email failures in the existing admin email log.
3. Set a strong `CRON_SECRET` in the Vercel production environment. Vercel automatically sends it as `Authorization: Bearer <CRON_SECRET>` to the existing GET-compatible `/api/feedback/cron` endpoint. Supervisors must opt in under Hub settings.
4. Deploy `vercel.json` to production to register the weekday schedule `0 8 * * 1-5` (08:00 UTC). On Hobby, invocation can occur during the scheduled hour: 08:00–08:59 UK time in winter and 09:00–09:59 in summer. Both fit the endpoint's 08:00 inclusive to 11:00 exclusive London-time window. Weekends and England and Wales bank holidays are skipped by the endpoint, which deduplicates by supervisor and UK date and skips empty queues and ineligible supervisors.
5. Check the Vercel project's Cron Jobs panel and function logs after deployment. The Feedback Hub GitHub Actions workflow has been removed; its `FEEDBACK_CRON_URL` repository secret is no longer used. Keep the shared `CRON_SECRET` repository secret while project notification workflows still use it. Vercel cron jobs do not automatically retry failed invocations; inspect failures and retry within the sending window if necessary.

## Review behaviour

- Supervisors can use **Add manual update** in review details to enter a title (up to 200 characters) and details (up to 5,000 characters). Each update is dated, saved against that review version and shown in the public progress strip beside the stage at which it was added. Signed-in recipients also see it in progress history. Updates remain visible if the stage later changes or moves backwards. Cancelled reviews show their updates below the cancellation notice.
- **Email notification to the student** starts unticked. Selecting it sends the update title, details and tracking link using the editable `feedback_manual_update` email template. If delivery fails, the saved update remains available and the supervisor receives a warning. Private reviews support manual updates in their supervisor-only history, with no student email option. Manual updates do not change stages, estimates or queue positions.
- Manual updates use existing `FeedbackEvent` records (`MANUAL_UPDATE`, with structured title, detail and stage in the message). Only their explicit student-facing content and date are exposed on public tracking pages; other internal history remains private. No database migration is required.
- Supervisors can edit **Title of work** in review details. The title is shared by all versions; changing it preserves review IDs, queue positions, history and tracking links, and sends no email. Future tracking displays and emails use the updated title; previously sent emails keep their original text.
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

Before rollout, use a staging database and mail account to walk through receipt → stage changes → estimate revision → overdue request → completion → reopen → completion again; confirm only one completion email. Check V2/V3 grouping, recipient registration and verification, cancellation, correction of an email address, expired supervisor access, unrelated-account denial, and summary invocations at the 08:00 and 11:00 London-time boundaries. Confirm the migration is applied before exposing Hub routes.

## Queue position

The tracker and signed-in review list show a review's position among all of its supervisor's outstanding reviews, including those already being read. Completed and cancelled versions leave the queue. Only the position, total, and number ahead are visible to recipients; other work titles and recipients are never disclosed.

Default order is received date, then record creation time, then record ID to break ties. Supervisors can move an active review to a chosen position under review details. This preserves a manual order for the current queue; newly added or reopened reviews follow that manual queue in receipt-date order. “Restore receipt-date order” removes the manual ordering for the active queue. Position changes do not change feedback estimates or send emails. Tracking pages and signed-in lists refresh every minute.

The queue enhancement has its own migration, `20261030130000_feedback_queue`. Apply it with `npx prisma migrate deploy` before deploying this version, even if the original Feedback Hub migration was already applied. It adds a nullable position field; existing reviews automatically use receipt-date order.

Supervisors can permanently delete a review version from its details after confirmation. This deletes its progress history and tracking token without sending email or notifications. Other versions and their numbering are retained; deleting the final version also removes the work record. Deletion cannot be undone.


### Pausing a review

Select **Process Paused** in the stage selector, or open the review details and use **Pause and notify student**. The underlying review stage and queue position are preserved. An optional estimate in working days extends only the latest return date, excluding weekends and bank holidays. The student receives a pause email with a tracking link and no dates. The public tracker shows a Paused pill beside the return estimate only while paused. Past pauses remain in the stage timeline.

To resume, check the earliest and latest return date fields in the details panel, then select **Reconfirm dates and resume**. Dates must be explicitly reconfirmed even if they are unchanged. Resume before selecting another review stage. Pause and resume actions are recorded in the private progress history.

Deployment requires applying the `20261104100000_feedback_pause` Prisma migration before serving the updated application.

## Page usage

Supervisors can expand **Show page usage** below the Hub review list for totals across their reviews and a paginated log, or open a review's details for its own usage. Times are shown in Europe/London time. Logs are private to the owning supervisor and separate from the student's progress history.

The browser sends a view only after review data loads and the page is visible. A tracking page open counts once; on the signed-in Hub, each review displayed by the current filters counts once during that page visit. Revisiting a review through another filter in the same visit does not add another view. Automatic minute-by-minute refreshes, background tabs awaiting their first view, and the supervisor's own signed-in visits do not add views. Retrying a POST with the same review and page-open ID is idempotent.

A verified account matching the recipient email is labelled with the recipient's name. Other tracking-page visitors are labelled “Somebody viewed the page”, including signed-in accounts that do not match. Anonymous views cannot establish who visited or how many distinct people visited. Basic email link scanners and prefetches do not execute the browser POST, although automated browsers running JavaScript may still count. Counts do not measure attention, email reading or reading of externally returned feedback, and cannot recover visits before this release.

The tracker and Hub include a short usage notice. Logs store the review, a random page-open ID, source, recipient name for matching accounts, and server timestamp. They do not store IP addresses, user agents, cookies or persistent visitor identifiers. Permanently deleting a review cascades to its view log. Collection failures do not prevent viewing feedback.

Apply `20261109210000_feedback_page_views` with `npx prisma migrate deploy` before deploying this version, then regenerate the Prisma client. No historical data is backfilled.

## Private assessment reviews

Select **Private review (no student link or emails)** when adding work. Enter a name or label and document title; no email is required or stored. These reviews belong to the supervisor only, appear in the normal queue, and contribute to queue positions shown to other recipients without exposing the private name or title. Completion and cancellation remove them from the active queue as usual.

A private review is represented by a null recipient email. It cannot appear in a student's account, be opened with a public tracking token, enable recipient registration, or send receipt, pause, revised-estimate or completion emails. Email retries and adding a recipient email are rejected. New versions inherit the existing work's privacy. Supervisor daily queue summaries still include this work. Private reviews have no page-usage panel because they cannot be viewed by students.

Apply `20261109220000_feedback_private_reviews` before deploying this feature. This makes the recipient email nullable; existing reviews keep their recipient links and normal behaviour.

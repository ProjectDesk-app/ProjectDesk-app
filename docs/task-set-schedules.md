# Task set timetables

Create a task set in the Task Library and select **L6 dissertation Gantt chart (2026–27)** to load the supplied timetable. Review the source notes, adjust dates and save. An empty task set can also be built with the same editor.

The timetable stores start and due offsets from a reference date, but the editor presents calendar dates. Moving the timetable start shifts every item by the same number of calendar days. To prepare next year's schedule, duplicate the set, rename it, move its timetable start, then adjust confirmed deadlines individually. This is a calendar-day shift, not automatic weekday or holiday alignment.

Work periods use inclusive calendar-day durations. Milestones have zero duration. Breaks appear in the template preview but are not created as project tasks and do not pause work. Explicit deadlines use Europe/London time, including British Summer Time. New dated items without a due time finish at 23:59 UK time.

Applying a set supports shared timetable dates, dates relative to the project's start, or a custom start. The project receives independent copies of tasks, start dates, durations and deadlines. Saving or duplicating a template does not update existing project tasks.

Application is atomic. If any task title already exists in a project, no tasks are added. Supervisors can only manage their own sets and apply them to projects they supervise; administrators can manage all sets.

## Source interpretation

The L6 starting option is a reviewed conversion of the supplied workbook, rather than a general Excel upload parser. Weekly bars are interpreted as Monday–Sunday periods. Preparation and presentation/interview windows are separate items, and interview preparation preserves its gap. Exact submission annotations override week boundaries. Feedback and grade-release notes are retained in descriptions.

The source has a March 2026 date in a March 2027 column and work bars extending beyond thesis submission. The starting option exposes these issues for review. The original workbook is unchanged.

Legacy task sets remain project-relative unless a timetable start is chosen. Existing templates without explicit start offsets retain the original duration interpretation, including their existing due-date behavior. Saving explicit dates uses inclusive duration.

## Deployment

The additive migration is `20261014120000_task_set_schedules`. Run `npx prisma migrate deploy` against the intended database and `npx prisma generate` before starting the updated app. The implementation does not apply a migration to a live database.

## Verification

Run `npm run test:tasksets` for schedule and API regression checks, then `npm run build`. The API regression tests use database doubles; they do not change account data.

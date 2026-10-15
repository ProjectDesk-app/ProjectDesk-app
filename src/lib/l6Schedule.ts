import { daysBetween, ScheduleKind, ScheduleTemplate } from "./taskSetSchedule";

export const L6_START = "2026-10-12";
export const L6_REVIEW_NOTES = [
  "Coloured weekly cells are treated as Monday–Sunday work periods. Explicit submission dates override the end of a coloured week.",
  "Supervisor reading draft uses the column date, 22 March 2027. The cell contains 22 March 2026, which appears to be a typo. Check this before saving.",
  "Presentation and interview windows have been separated from preparation. Interview preparation remains in two periods around the winter break.",
  "Breaks are shown for reference. Data collection continues through winter as drawn in the source; breaks do not automatically pause or extend tasks.",
  "Submission times are UK time. Feedback booking and grade-release notes remain in descriptions; review them against this year's confirmed dates.",
];

export function l6Schedule(): ScheduleTemplate[] {
  const items: [string, string, string, ScheduleKind?, string?, string?][] = [
    ["Initial planning", "2026-10-12", "2026-10-18"],
    ["Ethics form", "2026-10-12", "2026-11-15"],
    ["Ethics first submission", "2026-10-30", "2026-10-30", "MILESTONE"],
    ["Ethics second submission", "2026-11-13", "2026-11-13", "MILESTONE"],
    ["Ethics third submission", "2026-11-27", "2026-11-27", "MILESTONE"],
    ["Literature searching", "2026-10-12", "2026-12-06"],
    ["Reading", "2026-10-26", "2026-12-20"],
    ["Presentation preparation", "2026-11-09", "2026-11-26", "TASK", "13:00"],
    ["Presentations", "2026-11-30", "2026-12-13", "TASK", "", "Source note: book feedback and grade on 11 January; Turnitin release on 18 January. Check confirmed dates."],
    ["Writing Introduction", "2026-11-16", "2026-12-20"],
    ["Writing Methods", "2026-11-16", "2026-12-20"],
    ["Set up study", "2026-12-07", "2026-12-20"],
    ["Data collection", "2026-12-14", "2027-02-21"],
    ["Interview preparation before winter break", "2026-12-14", "2026-12-20"],
    ["Interview preparation after winter break", "2027-01-11", "2027-01-24"],
    ["Interviews", "2027-01-25", "2027-02-07", "TASK", "", "Source note: book feedback and grade on 22 February; Turnitin release on 8 March. Check confirmed dates."],
    ["Qualitative workshops", "2026-10-19", "2026-10-20"],
    ["Quantitative and qualitative workshops (week)", "2027-02-08", "2027-02-14", "TASK", "", "The workbook specifies the week, not individual workshop dates."],
    ["Analysis", "2027-02-15", "2027-03-07"],
    ["Writing Results", "2027-02-22", "2027-03-14"],
    ["Writing Discussion", "2027-03-01", "2027-03-21"],
    ["Supervisor reading draft", "2027-03-22", "2027-04-04", "TASK", "", "Uses the March 2027 column heading. The source cell says 22 March 2026; confirm this date."],
    ["Consider thesis feedback", "2027-03-29", "2027-04-18"],
    ["Rewrite and edit", "2027-04-05", "2027-04-25"],
    ["Finalise formatting", "2027-04-12", "2027-04-25", "TASK", "", "The source shades the full submission week. Consider ending this on or before the 22 April submission deadline."],
    ["Thesis Submission", "2027-04-22", "2027-04-22", "MILESTONE", "13:00"],
    ["Results release", "2027-05-24", "2027-05-24", "MILESTONE", "13:00"],
    ["Vacation – Graduation", "2026-11-09", "2026-11-15", "BREAK"],
    ["Winter vacation", "2026-12-21", "2027-01-10", "BREAK"],
    ["Spring vacation", "2027-03-22", "2027-04-04", "BREAK"],
  ];
  return items.map(([title, start, due, kind = "TASK", dueTime = "", description = ""], order) => ({
    title, description, kind, dueTime: dueTime || null, startOffset: daysBetween(L6_START, start),
    dueOffset: daysBetween(L6_START, due), duration: kind === "MILESTONE" ? 0 : daysBetween(start, due) + 1, order,
  }));
}

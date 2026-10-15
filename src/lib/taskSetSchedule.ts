export const SCHEDULE_TIME_ZONE = "Europe/London";
export const DAY_MS = 86_400_000;
export type ScheduleKind = "TASK" | "MILESTONE" | "BREAK";
export type ScheduleTemplate = {
  title: string;
  description?: string | null;
  startOffset?: number | null;
  dueOffset?: number | null;
  duration?: number | null;
  dueTime?: string | null;
  kind?: ScheduleKind | string;
  order?: number | null;
};

export function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function parseCalendarDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Use a valid calendar date (YYYY-MM-DD).");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || dateOnly(date) !== value) {
    throw new Error("Use a valid calendar date (YYYY-MM-DD).");
  }
  return date;
}

export function shiftDate(base: string, days: number): string {
  const date = parseCalendarDate(base);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseCalendarDate(end).getTime() - parseCalendarDate(start).getTime()) / DAY_MS);
}

export function ukCalendarDay(date: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function calendarDuration(start: Date, due: Date): number {
  return daysBetween(ukCalendarDay(start), ukCalendarDay(due)) + 1;
}

function optionalInteger(value: unknown, label: string, minimum = -3660): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > 3660) {
    throw new Error(`${label} must be a whole number between ${minimum} and 3660.`);
  }
  return value;
}

export function validateTemplates(value: unknown): Required<ScheduleTemplate>[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Provide up to 500 schedule items.");
  const titles = new Set<string>();
  return value.map((item, order) => {
    if (!item || typeof item.title !== "string" || !item.title.trim() || item.title.trim().length > 200) {
      throw new Error(`Item ${order + 1} needs a title of up to 200 characters.`);
    }
    const title = item.title.trim();
    if (titles.has(title)) throw new Error(`Each item needs a different title: “${title}”.`);
    titles.add(title);
    const kind = item.kind ?? "TASK";
    if (!["TASK", "MILESTONE", "BREAK"].includes(kind)) throw new Error(`Invalid item type for “${title}”.`);
    const startOffset = optionalInteger(item.startOffset, "Start offset");
    const dueOffset = optionalInteger(item.dueOffset, "Due offset");
    let duration = optionalInteger(item.duration, "Duration", 0);
    const dueTime = item.dueTime || null;
    if (dueTime && (typeof dueTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime))) {
      throw new Error(`Use a valid deadline time for “${title}”.`);
    }
    if (dueTime && dueOffset === null) throw new Error(`“${title}” needs a due date before adding a time.`);
    if (kind === "MILESTONE") {
      if (dueOffset === null) throw new Error(`“${title}” needs a milestone date.`);
      if (startOffset !== null && startOffset !== dueOffset) throw new Error(`“${title}” is a single-date milestone.`);
      duration = 0;
    } else if (startOffset !== null && dueOffset !== null) {
      if (dueOffset < startOffset) throw new Error(`“${title}” finishes before it starts.`);
      duration = dueOffset - startOffset + 1;
      if (duration > 3660) throw new Error(`“${title}” exceeds the maximum duration of 3660 days.`);
    } else if (duration === 0) {
      throw new Error(`Use milestone for a zero-duration item: “${title}”.`);
    }
    if (kind === "BREAK" && (startOffset === null || dueOffset === null)) {
      throw new Error(`“${title}” needs both break dates.`);
    }
    if (item.description != null && typeof item.description !== "string") throw new Error("Descriptions must be text.");
    return { title, description: item.description || null, startOffset: kind === "MILESTONE" ? dueOffset : startOffset,
      dueOffset, duration, dueTime, kind, order };
  });
}

// Convert a UK wall-clock deadline to an instant, including British Summer Time.
export function deadlineInstant(day: string, time: string | null = null): Date {
  if (!time) return parseCalendarDate(day);
  const target = new Date(`${day}T${time}:00.000Z`).getTime();
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    if (local === target) return new Date(instant);
    instant += target - local;
  }
  throw new Error(`The time ${time} on ${day} does not exist in UK time. Choose another time.`);
}

export function resolveTemplate(template: ScheduleTemplate, base: string) {
  const dueDay = template.dueOffset != null ? shiftDate(base, template.dueOffset) : null;
  // Existing templates used duration as the distance backwards from the due date.
  // Keep that interpretation until explicit start and due dates are saved in the editor.
  const startOffset = template.startOffset ?? (template.kind === "MILESTONE" ? template.dueOffset :
    template.dueOffset != null && template.duration != null ? template.dueOffset - template.duration : null);
  const startDay = startOffset != null ? shiftDate(base, startOffset) : null;
  const explicitDates = template.startOffset != null || template.kind === "MILESTONE";
  const dueDate = dueDay ? deadlineInstant(dueDay, template.dueTime || (explicitDates ? "23:59" : null)) : null;
  const startDate = template.kind === "MILESTONE" ? dueDate :
    startDay ? (explicitDates ? deadlineInstant(startDay, "00:00") : parseCalendarDate(startDay)) : null;
  return { startDay, dueDay, startDate, dueDate,
    duration: template.kind === "MILESTONE" ? 0 : startDay && dueDay ? daysBetween(startDay, dueDay) + 1 : template.duration ?? null };
}

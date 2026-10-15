import { daysBetween, resolveTemplate, ScheduleTemplate, shiftDate } from "@/lib/taskSetSchedule";

const label = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(day));

export default function TaskSetTimeline({ templates, startDate }: { templates: ScheduleTemplate[]; startDate: string }) {
  if (!startDate) return <p className="text-sm text-gray-600">Choose a timetable start to preview calendar dates.</p>;
  let rows: { item: ScheduleTemplate; start: string; due: string }[];
  try {
    rows = templates.flatMap(item => {
      const dates = resolveTemplate(item, startDate);
      return dates.startDay && dates.dueDay && dates.dueDay >= dates.startDay
        ? [{ item, start: dates.startDay, due: dates.dueDay }] : [];
    });
  } catch (error) { return <p role="alert" className="text-sm text-red-600">{(error as Error).message}</p>; }
  if (!rows.length) return <p className="text-sm text-gray-600">Add start and due dates to see the timetable.</p>;
  const first = rows.reduce((date, row) => row.start < date ? row.start : date, rows[0].start);
  const last = rows.reduce((date, row) => row.due > date ? row.due : date, rows[0].due);
  const span = Math.max(1, daysBetween(first, last) + 1);
  return (
    <section aria-label="Timetable preview" className="space-y-2">
      <h3 className="font-medium">Gantt preview</h3>
      <p className="text-xs text-gray-600">Work period ▬ · Milestone ◆ · Break ▱ · {rows.length} scheduled items</p>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="bg-gray-50">
            <th className="w-56 px-3 py-2 text-left font-medium">Item</th>
            <th className="px-3 py-2 font-normal">
              <div className="flex justify-between text-xs text-gray-600">
                {[0, 0.25, 0.5, 0.75, 1].map(f => <span key={f}>{label(shiftDate(first, Math.round((span - 1) * f)))}</span>)}
              </div>
            </th>
          </tr></thead>
          <tbody>{rows.map(({ item, start, due }, index) => {
            const left = daysBetween(first, start) / span * 100;
            const width = (daysBetween(start, due) + 1) / span * 100;
            const info = `${item.title}: ${start} to ${due}${item.dueTime ? " at " + item.dueTime + " UK time" : ""}`;
            return <tr key={index} className="border-t border-gray-100">
              <th scope="row" className="px-3 py-1.5 text-left font-normal">{item.title || "Untitled item"}</th>
              <td className="px-3 py-1.5">
                <div className="relative h-6 bg-gray-50" aria-label={info} title={info}>
                  {item.kind === "MILESTONE" ?
                    <span className="absolute top-1 h-4 w-4 rotate-45 bg-blue-700" style={{ left: `clamp(0px, ${left}%, calc(100% - 16px))` }} /> :
                    <span className={`absolute top-1 h-4 rounded-sm ${item.kind === "BREAK" ? "border border-dashed border-gray-500 bg-gray-200" : "bg-blue-500"}`} style={{ left: `${left}%`, width: `${width}%`, minWidth: 2 }} />}
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

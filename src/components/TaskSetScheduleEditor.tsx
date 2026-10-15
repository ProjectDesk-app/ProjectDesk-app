import { daysBetween, ScheduleKind, ScheduleTemplate, shiftDate } from "@/lib/taskSetSchedule";
import TaskSetTimeline from "./TaskSetTimeline";
import { CSSProperties, ReactNode, useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

function SortableScheduleItem({ id, title, summary, disabled, children }: { id: string; title: string; summary: string; disabled: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(!title);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return <div ref={setNodeRef} style={style} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex items-start gap-2">
      <button type="button" disabled={disabled} {...attributes} {...listeners} aria-label={`Drag to reorder ${title || "item"}`}
        className="rounded p-1 text-gray-500 hover:bg-gray-100" style={{ touchAction: "none" }}>
        <GripVertical size={18} />
      </button>
      <details className="min-w-0 flex-1" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary className="cursor-pointer">
          <span className="font-medium">{title || "New item"}</span>
          <span className="mt-1 block text-sm text-gray-600">{summary}</span>
        </summary>
        <div className="mt-4 space-y-3">{children}</div>
      </details>
    </div>
  </div>;
}

export default function TaskSetScheduleEditor({ templates, startDate, onChange, disabled = false }: {
  templates: ScheduleTemplate[]; startDate: string; onChange: (items: ScheduleTemplate[]) => void; disabled?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = templates.map((item, index) => String((item as ScheduleTemplate & { id?: number }).id ?? `draft-${index}`));
  const update = (index: number, changes: Partial<ScheduleTemplate>) => {
    const updated = { ...templates[index], ...changes };
    if (updated.kind === "MILESTONE") {
      updated.startOffset = updated.dueOffset ?? null;
      updated.duration = 0;
    } else if (updated.startOffset != null && updated.dueOffset != null && updated.dueOffset >= updated.startOffset) {
      updated.duration = updated.dueOffset - updated.startOffset + 1;
    }
    onChange(templates.map((item, i) => i === index ? updated : item));
  };
  const updateDate = (index: number, field: "startOffset" | "dueOffset", day: string) => {
    if (!startDate) return;
    update(index, { [field]: day ? daysBetween(startDate, day) : null });
  };
  const number = (value: string) => value === "" ? null : Number(value);
  const move = (index: number, direction: number) => {
    const next = [...templates];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  };
  const day = (offset: number | null | undefined) => {
    try { return startDate && offset != null ? shiftDate(startDate, offset) : ""; } catch { return ""; }
  };
  const summary = (item: ScheduleTemplate) => {
    const kind = item.kind === "BREAK" ? "Break" : item.kind === "MILESTONE" ? "Milestone" : "Work period";
    const start = day(item.startOffset), due = day(item.dueOffset);
    const format = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
    return [kind, start && due ? (start === due ? format(due) : `${format(start)} – ${format(due)}`) :
      due ? `Due ${format(due)}` : "Dates not set", item.duration != null && item.kind !== "MILESTONE" ? `${item.duration} days` : "",
      item.dueTime ? `${item.dueTime} UK time` : ""].filter(Boolean).join(" · ");
  };
  return <div className="space-y-5">
    <TaskSetTimeline templates={templates} startDate={startDate} />
    <p className="text-sm text-gray-600">Enter dates or durations. Duration includes the first and last calendar day. Dates without a due time finish at 23:59 UK time. Breaks are not created as project tasks.</p>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
      if (disabled || !over || active.id === over.id) return;
      const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
      if (from !== -1 && to !== -1) onChange(arrayMove(templates, from, to));
    }}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
    <fieldset disabled={disabled} className="space-y-3">
      {templates.map((item, index) => (
        <SortableScheduleItem key={ids[index]} id={ids[index]} title={item.title} summary={summary(item)} disabled={disabled}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 basis-[180px] flex-1 text-sm font-medium">Title
              <input aria-label={`Item ${index + 1} title`} value={item.title} onChange={e => update(index, { title: e.target.value })} maxLength={200} required className="mt-1 w-full rounded border px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium">Type
              <select value={item.kind || "TASK"} onChange={e => update(index, { kind: e.target.value as ScheduleKind,
                ...(e.target.value !== "MILESTONE" && item.duration === 0 ? { duration: 1 } : {}) })}
                className="mt-1 block rounded border px-3 py-2 font-normal">
                <option value="TASK">Work period</option><option value="MILESTONE">Milestone</option><option value="BREAK">Break</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button type="button" aria-label={`Move ${item.title || "item"} up`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded border px-3 py-2 disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Move ${item.title || "item"} down`} disabled={index === templates.length - 1} onClick={() => move(index, 1)} className="rounded border px-3 py-2 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => onChange(templates.filter((_, i) => i !== index))} className="rounded border px-3 py-2 text-red-700">Remove</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium">Start date
              <input type="date" value={day(item.startOffset)} onChange={e => updateDate(index, "startOffset", e.target.value)} disabled={!startDate || item.kind === "MILESTONE"} className="mt-1 block w-full min-w-0 rounded border px-2 py-2 font-normal disabled:bg-gray-50" />
            </label>
            <label className="text-sm font-medium">{item.kind === "BREAK" ? "End date" : item.kind === "MILESTONE" ? "Milestone date" : "Due date"}
              <input type="date" value={day(item.dueOffset)} onChange={e => updateDate(index, "dueOffset", e.target.value)} disabled={!startDate} className="mt-1 block w-full min-w-0 rounded border px-2 py-2 font-normal disabled:bg-gray-50" />
            </label>
            <label className="text-sm font-medium">Due time (UK)
              <input type="time" value={item.dueTime || ""} onChange={e => update(index, { dueTime: e.target.value || null })} disabled={item.kind === "BREAK"} className="mt-1 block w-full min-w-0 rounded border px-2 py-2 font-normal disabled:bg-gray-50" />
            </label>
            <label className="text-sm font-medium">Duration (days)
              <input type="number" min={1} max={3660} value={item.duration ?? ""} disabled={item.kind === "MILESTONE"} onChange={e => {
                const duration = number(e.target.value);
                update(index, { duration, ...(duration !== null && item.startOffset != null ? { dueOffset: item.startOffset + duration - 1 } : {}) });
              }} className="mt-1 block w-full rounded border px-2 py-2 font-normal disabled:bg-gray-50" />
            </label>
          </div>
          <details className="text-sm text-gray-600">
            <summary className="cursor-pointer">Description and day offsets</summary>
            <label className="mt-2 block">Description
              <textarea value={item.description || ""} onChange={e => update(index, { description: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>Start offset (day 0 is timetable start)
                <input type="number" min={-3660} max={3660} value={item.startOffset ?? ""} disabled={item.kind === "MILESTONE"} onChange={e => update(index, { startOffset: number(e.target.value) })} className="mt-1 block w-full rounded border px-3 py-2" />
              </label>
              <label>Due offset (day 0 is timetable start)
                <input type="number" min={-3660} max={3660} value={item.dueOffset ?? ""} onChange={e => update(index, { dueOffset: number(e.target.value) })} className="mt-1 block w-full rounded border px-3 py-2" />
              </label>
            </div>
          </details>
        </SortableScheduleItem>
      ))}
      <button type="button" onClick={() => onChange([...templates, { title: "", kind: "TASK", startOffset: null, dueOffset: null, duration: null, dueTime: null }])} className="rounded border border-blue-600 px-4 py-2 text-blue-700 hover:bg-blue-50">Add schedule item</button>
    </fieldset>
    </SortableContext>
    </DndContext>
  </div>;
}

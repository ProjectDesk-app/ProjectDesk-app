import { useRouter } from "next/router";
import useSWR from "swr";
import Layout from "@/components/Layout";
import dynamic from "next/dynamic";
import { ViewMode, Task } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const NAME_COLUMN_MIN = 160;
const NAME_COLUMN_MAX = 520;
const TIMELINE_COLUMN_MIN = 40;
const TIMELINE_COLUMN_MAX = 180;
const DEFAULT_NAME_COLUMN_WIDTH = 240;
const DEFAULT_TIMELINE_COLUMN_WIDTH = 82;
const DATE_COLUMN_WIDTH = 110;
const PRINT_NAME_COLUMN_WIDTH = 210;
const PRINT_DATE_COLUMN_WIDTH = 84;
const PRINT_TIMELINE_COLUMN_WIDTH = 44;
const DEFAULT_ROW_HEIGHT = 50;
const PRINT_ROW_HEIGHT = 34;
const DEFAULT_HEADER_HEIGHT = 50;
const PRINT_HEADER_HEIGHT = 38;
const GANTT_NAME_WIDTH_STORAGE_KEY = "projectdesk:gantt:name-column-width";
const GANTT_TIMELINE_WIDTH_STORAGE_KEY = "projectdesk:gantt:timeline-column-width";
const COLOR_FLAGGED = "#8b5cf6";
const COLOR_OVERDUE = "#ef4444";
const COLOR_LONG_DURATION = "#f59e0b";
const COLOR_DONE = "#16a34a";
const COLOR_IN_PROGRESS = "#2563eb";
const COLOR_TODO = "#6b7280";

type TaskListHeaderProps = {
  headerHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
};

type TaskListTableProps = {
  rowHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
  locale: string;
  tasks: Task[];
  selectedTaskId: string;
  setSelectedTask: (taskId: string) => void;
  onExpanderClick: (task: Task) => void;
};

const normalizeStatus = (status: unknown) =>
  typeof status === "string" ? status.toLowerCase() : String(status ?? "").toLowerCase();

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const COMPACT_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "2-digit",
});

const LEGEND_ITEMS: Array<{ label: string; color: string; description: string }> = [
  { label: "Flagged", color: COLOR_FLAGGED, description: "Needs support" },
  { label: "Overdue", color: COLOR_OVERDUE, description: "Past due date" },
  { label: "Long duration", color: COLOR_LONG_DURATION, description: "More than 30 days" },
  { label: "In progress", color: COLOR_IN_PROGRESS, description: "Active work" },
  { label: "Done", color: COLOR_DONE, description: "Completed" },
  { label: "To do", color: COLOR_TODO, description: "Not started" },
];

function LegendSwatch({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg
      className="gantt-legend-swatch"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <rect x="0.5" y="0.5" width="11" height="11" rx="1.5" fill={color} stroke="#9ca3af" />
    </svg>
  );
}

export default function GanttPage() {
  const router = useRouter();
  const { id: rawId } = router.query;
  const projectId = Array.isArray(rawId) ? rawId[0] : rawId;
  const { data: tasks, mutate } = useSWR(projectId ? `/api/tasks?projectId=${projectId}` : null, fetcher);
  const { data: project } = useSWR(projectId ? `/api/projects/${projectId}` : null, fetcher);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week);
  const [sortMode, setSortMode] = useState<"manual" | "start" | "due">("manual");
  const [isMobile, setIsMobile] = useState(false);
  const [nameColumnWidth, setNameColumnWidth] = useState(DEFAULT_NAME_COLUMN_WIDTH);
  const [timelineColumnWidth, setTimelineColumnWidth] = useState(DEFAULT_TIMELINE_COLUMN_WIDTH);
  const [isResizingNameColumn, setIsResizingNameColumn] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_NAME_COLUMN_WIDTH);
  const printFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const updateIsMobile = () => {
      if (typeof window === "undefined") return;
      setIsMobile(window.innerWidth < 640);
    };
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedNameWidth = Number(window.localStorage.getItem(GANTT_NAME_WIDTH_STORAGE_KEY));
    if (Number.isFinite(savedNameWidth)) {
      setNameColumnWidth(clampNumber(savedNameWidth, NAME_COLUMN_MIN, NAME_COLUMN_MAX));
    }
    const savedTimelineWidth = Number(window.localStorage.getItem(GANTT_TIMELINE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(savedTimelineWidth)) {
      setTimelineColumnWidth(clampNumber(savedTimelineWidth, TIMELINE_COLUMN_MIN, TIMELINE_COLUMN_MAX));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GANTT_NAME_WIDTH_STORAGE_KEY, String(nameColumnWidth));
  }, [nameColumnWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GANTT_TIMELINE_WIDTH_STORAGE_KEY, String(timelineColumnWidth));
  }, [timelineColumnWidth]);

  useEffect(() => {
    if (!isResizingNameColumn) return;

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = resizeStartWidthRef.current + (event.clientX - resizeStartXRef.current);
      setNameColumnWidth(clampNumber(nextWidth, NAME_COLUMN_MIN, NAME_COLUMN_MAX));
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!event.touches[0]) return;
      event.preventDefault();
      const nextWidth = resizeStartWidthRef.current + (event.touches[0].clientX - resizeStartXRef.current);
      setNameColumnWidth(clampNumber(nextWidth, NAME_COLUMN_MIN, NAME_COLUMN_MAX));
    };

    const stopResize = () => {
      setIsResizingNameColumn(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", stopResize);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopResize);
    };
  }, [isResizingNameColumn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleAfterPrint = () => {
      if (printFallbackTimerRef.current) {
        clearTimeout(printFallbackTimerRef.current);
        printFallbackTimerRef.current = null;
      }
      setPrintMode(false);
      setIsPreparingPdf(false);
    };

    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      if (printFallbackTimerRef.current) {
        clearTimeout(printFallbackTimerRef.current);
      }
    };
  }, []);

  const beginNameColumnResize = useCallback(
    (clientX: number) => {
      resizeStartXRef.current = clientX;
      resizeStartWidthRef.current = nameColumnWidth;
      setIsResizingNameColumn(true);
    },
    [nameColumnWidth]
  );

  const projectTitle = project?.title || (projectId ? `Project ${projectId}` : "Project");
  const pageTitle = `${projectTitle} Gantt Chart`;
  const effectiveNameColumnWidth = printMode
    ? clampNumber(Math.min(nameColumnWidth, PRINT_NAME_COLUMN_WIDTH), NAME_COLUMN_MIN, NAME_COLUMN_MAX)
    : nameColumnWidth;
  const effectiveDateColumnWidth = printMode ? PRINT_DATE_COLUMN_WIDTH : DATE_COLUMN_WIDTH;
  const effectiveTimelineColumnWidth = printMode
    ? clampNumber(Math.min(timelineColumnWidth, PRINT_TIMELINE_COLUMN_WIDTH), TIMELINE_COLUMN_MIN, TIMELINE_COLUMN_MAX)
    : timelineColumnWidth;
  const effectiveViewMode = printMode ? ViewMode.Month : viewMode;
  const effectiveRowHeight = printMode ? PRINT_ROW_HEIGHT : DEFAULT_ROW_HEIGHT;
  const effectiveHeaderHeight = printMode ? PRINT_HEADER_HEIGHT : DEFAULT_HEADER_HEIGHT;

  if (!tasks)
    return (
      <Layout title={pageTitle} fluid>
        <LoadingState
          title="Preparing your Gantt chart"
          message="We’re organising project tasks and timelines for a clear visual overview."
          tone="brand"
        />
      </Layout>
    );

  if (!tasks || tasks.length === 0) {
    return (
      <Layout title={pageTitle} fluid>
        <div className="p-6 border rounded-md bg-gray-50 text-center text-gray-600">
          <h2 className="text-lg font-semibold mb-2">No Tasks Available</h2>
          <p>You can add new tasks from the Tasks tab to populate the Gantt chart.</p>
        </div>
      </Layout>
    );
  }

  // Enhanced getTaskColor for overdue and long-duration tasks
  function getEnhancedTaskColor(t: any, end: Date, durationDays: number) {
    const today = new Date();
    const status = normalizeStatus(t.status);
    if (t.flagged) return COLOR_FLAGGED;
    if (t.dueDate && new Date(t.dueDate) < today) return COLOR_OVERDUE;
    if (durationDays > 30) return COLOR_LONG_DURATION;
    if (status === "done") return COLOR_DONE;
    if (status === "in_progress") return COLOR_IN_PROGRESS;
    if (status === "todo") return COLOR_TODO;
    return COLOR_TODO;
  }

  let sortedTasks = [...tasks];
  if (sortMode === "start") {
    sortedTasks.sort((a: any, b: any) => new Date(a.startDate || a.dueDate).getTime() - new Date(b.startDate || b.dueDate).getTime());
  } else if (sortMode === "due") {
    sortedTasks.sort((a: any, b: any) => new Date(a.dueDate || a.startDate).getTime() - new Date(b.dueDate || b.startDate).getTime());
  }
  const ganttTasks: Task[] = sortedTasks
    .map((t: any) => {
      // Determine duration in days
      let duration = t.duration;
      if (typeof duration !== "number" || duration <= 0) duration = 7;
      // Improved logic: prefer startDate if available
      let start: Date;
      let end: Date;

      if (t.startDate) {
        start = new Date(t.startDate);
        if (t.dueDate) {
          end = new Date(t.dueDate);
        } else {
          end = new Date(start);
          end.setDate(start.getDate() + duration);
        }
      } else {
        if (t.dueDate) {
          end = new Date(t.dueDate);
          start = new Date(end);
          start.setDate(end.getDate() - duration);
        } else {
          end = new Date();
          start = new Date();
          start.setDate(end.getDate() - duration);
        }
      }
      // Calculate durationDays for color logic
      const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const color = getEnhancedTaskColor(t, end, durationDays);
      const status = normalizeStatus(t.status);
      return {
        id: String(t.id),
        name: t.title,
        start,
        end,
        progress: status === "done" ? 100 : status === "in_progress" ? 50 : 0,
        dependencies: t.dependencyTaskId ? [String(t.dependencyTaskId)] : [],
        type: "task",
        styles: {
          progressColor: color,
          backgroundColor: color,
          backgroundSelectedColor: color
        }
      };
    });

  const formatCompactDate = (date: Date) => COMPACT_DATE_FORMATTER.format(date);
  const projectWindow = ganttTasks.reduce(
    (acc, task) => {
      const startTime = task.start.getTime();
      const endTime = task.end.getTime();
      return {
        minStart: Math.min(acc.minStart, startTime),
        maxEnd: Math.max(acc.maxEnd, endTime),
      };
    },
    { minStart: Number.POSITIVE_INFINITY, maxEnd: Number.NEGATIVE_INFINITY }
  );

  const hasProjectWindow =
    Number.isFinite(projectWindow.minStart) && Number.isFinite(projectWindow.maxEnd);
  const projectRangeLabel = hasProjectWindow
    ? `${formatCompactDate(new Date(projectWindow.minStart))} - ${formatCompactDate(new Date(projectWindow.maxEnd))}`
    : "N/A";

  const GanttComponent = dynamic(() =>
    import("gantt-task-react").then((mod) => mod.Gantt)
  , { ssr: false });

  const taskListTotalWidth = effectiveNameColumnWidth + effectiveDateColumnWidth * 2;

  const handleNameDividerMouseDown = (event: any) => {
    event.preventDefault();
    beginNameColumnResize(event.clientX);
  };

  const handleNameDividerTouchStart = (event: any) => {
    if (!event.touches?.[0]) return;
    beginNameColumnResize(event.touches[0].clientX);
  };

  const CustomTaskListHeader = ({ headerHeight, fontFamily, fontSize }: TaskListHeaderProps) => (
    <div
      style={{
        fontFamily,
        fontSize,
        width: taskListTotalWidth,
        borderTop: "1px solid #e6e4e4",
        borderLeft: "1px solid #e6e4e4",
        borderBottom: "1px solid #e6e4e4",
        backgroundColor: "#fff",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${effectiveNameColumnWidth}px ${effectiveDateColumnWidth}px ${effectiveDateColumnWidth}px`,
          height: headerHeight - 2,
        }}
      >
        <div
          className="relative flex items-center border-r border-gray-300 px-2 font-medium text-gray-800"
          style={{ minWidth: effectiveNameColumnWidth }}
        >
          Name
          <button
            type="button"
            aria-label="Resize Name column"
            className={`absolute -right-1 top-0 h-full w-2 cursor-col-resize touch-none ${
              isResizingNameColumn ? "bg-blue-200" : "bg-transparent hover:bg-gray-200"
            }`}
            onMouseDown={handleNameDividerMouseDown}
            onTouchStart={handleNameDividerTouchStart}
          />
        </div>
        <div
          className="flex items-center border-r border-gray-300 px-2 font-medium text-gray-800"
          style={{ minWidth: effectiveDateColumnWidth }}
        >
          From
        </div>
        <div
          className="flex items-center px-2 font-medium text-gray-800"
          style={{ minWidth: effectiveDateColumnWidth }}
        >
          To
        </div>
      </div>
    </div>
  );

  const CustomTaskListTable = ({
    rowHeight,
    fontFamily,
    fontSize,
    tasks,
    selectedTaskId,
    setSelectedTask,
    onExpanderClick,
  }: TaskListTableProps) => {
    const formatTaskDate = (value: unknown) => {
      const date = value instanceof Date ? value : new Date(value as string);
      if (Number.isNaN(date.getTime())) return "N/A";
      return COMPACT_DATE_FORMATTER.format(date);
    };

    const gridTemplateColumns = `${effectiveNameColumnWidth}px ${effectiveDateColumnWidth}px ${effectiveDateColumnWidth}px`;
    return (
      <div
        style={{
          fontFamily,
          fontSize,
          width: taskListTotalWidth,
          borderLeft: "1px solid #e6e4e4",
          borderBottom: "1px solid #e6e4e4",
        }}
      >
        {tasks.map((task, index) => {
          const expanderSymbol = task.hideChildren === false ? "▼" : task.hideChildren === true ? "▶" : "";
          const isSelected = selectedTaskId === task.id;
          const rowBackground =
            isSelected
              ? "#dbeafe"
              : index % 2 === 0
              ? "#ffffff"
              : "#f5f5f5";
          return (
            <div
              key={`${task.id}-row`}
              style={{
                height: rowHeight,
                display: "grid",
                gridTemplateColumns,
                backgroundColor: rowBackground,
                borderBottom: "1px solid #ebeff2",
                cursor: "pointer",
              }}
              onClick={() => setSelectedTask(task.id)}
            >
              <div
                title={task.name}
                className="flex min-w-0 items-center gap-1 border-r border-gray-200 px-2"
              >
                {expanderSymbol ? (
                  <button
                    type="button"
                    className="px-1 text-xs text-gray-600 hover:text-gray-900"
                    onClick={(event) => {
                      event.stopPropagation();
                      onExpanderClick(task);
                    }}
                  >
                    {expanderSymbol}
                  </button>
                ) : (
                  <span className="w-4" />
                )}
                <span className="truncate">{task.name}</span>
              </div>
              <div className="truncate border-r border-gray-200 px-2">
                {formatTaskDate(task.start)}
              </div>
              <div className="truncate px-2">
                {formatTaskDate(task.end)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const handleDateChange = async (task: Task, _children: Task[]) => {
    // Update the task dueDate and start date via PATCH
    const newDueDate = task.end.toISOString();
    const newStartDate = task.start.toISOString();
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: newDueDate, startDate: newStartDate }),
    });
    mutate();
  };

  const handleProgressChange = async (task: Task) => {
    // Convert progress to status and update
    let status = "todo";
    if (task.progress === 100) status = "done";
    else if (task.progress > 0) status = "in_progress";

    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    mutate();
  };

  const handleExportPdf = () => {
    if (typeof window === "undefined") return;
    setIsPreparingPdf(true);
    setPrintMode(true);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
        if (printFallbackTimerRef.current) {
          clearTimeout(printFallbackTimerRef.current);
        }
        printFallbackTimerRef.current = setTimeout(() => {
          setPrintMode(false);
          setIsPreparingPdf(false);
          printFallbackTimerRef.current = null;
        }, 2500);
      });
    });
  };

  function CustomTooltip({ task }: { task: Task }) {
    const durationDays = Math.round((task.end.getTime() - task.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const shortDateFormatter = new Intl.DateTimeFormat(undefined, isMobile
      ? { day: "2-digit", month: "2-digit", year: "2-digit" }
      : { year: "numeric", month: "short", day: "numeric" });
    return (
      <div className="p-2 bg-white border rounded shadow-md text-sm max-w-xs">
        <div><strong>{task.name}</strong></div>
        <div>Start: {shortDateFormatter.format(task.start)}</div>
        <div>End: {shortDateFormatter.format(task.end)}</div>
        <div>Duration: {durationDays} day{durationDays !== 1 ? 's' : ''}</div>
      </div>
    );
  }

  return (
    <Layout title={pageTitle} fluid>
      {isMobile && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          For the best experience, try viewing the Gantt chart on a larger screen.
        </div>
      )}
      <div className="gantt-no-print flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <h1 className="text-2xl font-semibold">{pageTitle}</h1>
        <a href={`/projects/${projectId}`} className="text-sm border px-3 py-1 rounded-md">
          Back to Project
        </a>
      </div>

      <div className="gantt-no-print mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            className={`px-3 py-1 rounded-md border ${viewMode === ViewMode.Day ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setViewMode(ViewMode.Day)}
          >
            Day
          </button>
          <button
            className={`px-3 py-1 rounded-md border ${viewMode === ViewMode.Week ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setViewMode(ViewMode.Week)}
          >
            Week
          </button>
          <button
            className={`px-3 py-1 rounded-md border ${viewMode === ViewMode.Month ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setViewMode(ViewMode.Month)}
          >
            Month
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={`px-3 py-1 rounded-md border ${sortMode === "manual" ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setSortMode("manual")}
          >
            Default Sort
          </button>
          <button
            className={`px-3 py-1 rounded-md border ${sortMode === "start" ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setSortMode("start")}
          >
            Start Date
          </button>
          <button
            className={`px-3 py-1 rounded-md border ${sortMode === "due" ? "bg-blue-500 text-white" : ""}`}
            onClick={() => setSortMode("due")}
          >
            Due Date
          </button>
          <button
            className="px-3 py-1 rounded-md border border-blue-500 text-blue-600 hover:bg-blue-50"
            onClick={handleExportPdf}
            type="button"
            disabled={isPreparingPdf}
          >
            {isPreparingPdf ? "Preparing PDF..." : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="gantt-no-print mb-4 flex flex-wrap items-center gap-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="whitespace-nowrap">Name column</span>
          <input
            type="range"
            min={NAME_COLUMN_MIN}
            max={NAME_COLUMN_MAX}
            value={nameColumnWidth}
            onChange={(event) =>
              setNameColumnWidth(
                clampNumber(Number(event.target.value), NAME_COLUMN_MIN, NAME_COLUMN_MAX)
              )
            }
            className="w-36"
          />
          <span className="w-12 text-right text-xs font-medium text-gray-600">
            {nameColumnWidth}px
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="whitespace-nowrap">Timeline scale</span>
          <input
            type="range"
            min={TIMELINE_COLUMN_MIN}
            max={TIMELINE_COLUMN_MAX}
            value={timelineColumnWidth}
            onChange={(event) =>
              setTimelineColumnWidth(
                clampNumber(
                  Number(event.target.value),
                  TIMELINE_COLUMN_MIN,
                  TIMELINE_COLUMN_MAX
                )
              )
            }
            className="w-36"
          />
          <span className="w-12 text-right text-xs font-medium text-gray-600">
            {timelineColumnWidth}px
          </span>
        </label>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
          onClick={() => {
            setNameColumnWidth(DEFAULT_NAME_COLUMN_WIDTH);
            setTimelineColumnWidth(DEFAULT_TIMELINE_COLUMN_WIDTH);
          }}
        >
          Reset sizes
        </button>
        <p className="text-xs text-gray-500">
          Tip: drag the divider after Name in the table header for quick resizing.
        </p>
      </div>

      <div className="gantt-legend mb-3 rounded-md border border-gray-200 bg-white px-3 py-2">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
          Colour key
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs text-gray-700">
              <LegendSwatch color={item.color} />
              <span className="font-medium">{item.label}</span>
              <span className="text-gray-500">({item.description})</span>
            </div>
          ))}
        </div>
      </div>

      <div id="gantt-print-area" className="w-full overflow-auto border rounded-md p-2 bg-white">
        <div className="gantt-print-header">
          <h2 className="text-lg font-semibold text-gray-900">{pageTitle}</h2>
          <p className="text-xs text-gray-600">
            Project range: {projectRangeLabel} | Generated: {formatCompactDate(new Date())}
          </p>
        </div>
        <div className="gantt-print-only mb-2 flex flex-wrap gap-x-4 gap-y-2 rounded border border-gray-200 bg-gray-50 px-2 py-1">
          {LEGEND_ITEMS.map((item) => (
            <div key={`print-${item.label}`} className="flex items-center gap-1.5 text-[10px] text-gray-700">
              <LegendSwatch color={item.color} size={10} />
              <span className="font-medium">{item.label}</span>
            </div>
          ))}
        </div>
        <GanttComponent
          tasks={ganttTasks}
          viewMode={effectiveViewMode}
          preStepsCount={printMode ? 0 : 1}
          columnWidth={effectiveTimelineColumnWidth}
          listCellWidth={`${taskListTotalWidth}px`}
          rowHeight={effectiveRowHeight}
          headerHeight={effectiveHeaderHeight}
          fontSize={printMode ? "11px" : "14px"}
          TaskListHeader={CustomTaskListHeader}
          TaskListTable={CustomTaskListTable}
          onDateChange={handleDateChange}
          onProgressChange={handleProgressChange}
          TooltipContent={CustomTooltip}
        />
      </div>
      <style jsx global>{`
        .gantt-print-header,
        .gantt-print-only {
          display: none;
        }
        .gantt-legend-swatch {
          flex: 0 0 auto;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print {
          @page {
            size: landscape;
            margin: 8mm;
          }
          html,
          body {
            background: #fff !important;
          }
          body {
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
          }
          .gantt-no-print {
            display: none !important;
          }
          .gantt-print-header,
          .gantt-print-only {
            display: block !important;
          }
          .gantt-print-header {
            margin-bottom: 6px;
          }
          body * {
            visibility: hidden;
          }
          #gantt-print-area,
          #gantt-print-area * {
            visibility: visible;
          }
          #gantt-print-area {
            position: absolute;
            inset: 0;
            width: 100%;
            height: auto;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            background: #fff !important;
          }
          #gantt-print-area ._3eULf {
            width: 100% !important;
          }
          #gantt-print-area [aria-label="Resize Name column"] {
            display: none !important;
          }
          #gantt-print-area svg text {
            font-size: 10px !important;
          }
          #gantt-print-area {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </Layout>
  );
}

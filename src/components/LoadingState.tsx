import { Loader2 } from "lucide-react";

type LoadingStateProps = {
  title?: string;
  message?: string;
  action?: React.ReactNode;
  fullScreen?: boolean;
  tone?: "default" | "brand";
};

export function LoadingState({
  title = "Loading",
  message = "Please wait a moment while we prepare everything for you.",
  action,
  fullScreen = true,
  tone = "default",
}: LoadingStateProps) {
  const containerClasses = fullScreen
    ? "min-h-[50vh] py-16"
    : "py-12";

  const accentClass =
    tone === "brand"
      ? "from-blue-500/10 via-purple-500/10 to-blue-500/5 border-blue-100"
      : "from-slate-200/60 via-white to-slate-200/40 border-slate-200";

  return (
    <div className={`flex w-full items-center justify-center px-4 ${containerClasses}`}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl shadow-xl">
        <div
          className={`absolute inset-0 bg-gradient-to-br ${accentClass}`}
          aria-hidden="true"
        />
        <div className="absolute inset-0 backdrop-blur-sm" aria-hidden="true" />
        <div className="relative flex flex-col items-center gap-5 px-10 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80 shadow-inner shadow-white/60">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="text-sm leading-relaxed text-slate-600">{message}</p>
          </div>
          {action ? <div className="pt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

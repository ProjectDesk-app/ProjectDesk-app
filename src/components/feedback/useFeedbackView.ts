import { useEffect, useRef } from 'react';

// Memory only: no cookies, IP addresses or persistent visitor identifiers.
export function useFeedbackView(targets: { token?: string; reviewId?: number; source: 'HUB' | 'TRACKING' }[], ready: boolean) {
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    function recordVisiblePage() {
      if (document.visibilityState !== 'visible') return;
      for (const target of targets) {
        const key = `${target.source}:${target.token || target.reviewId}`;
        if (sent.current.has(key)) continue;
        sent.current.add(key);
        void fetch('/api/feedback/views', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...target, viewId: crypto.randomUUID() }), keepalive: true }).catch(() => {});
      }
    }
    recordVisiblePage();
    document.addEventListener('visibilitychange', recordVisiblePage);
    return () => document.removeEventListener('visibilitychange', recordVisiblePage);
  }, [targets, ready]);
}

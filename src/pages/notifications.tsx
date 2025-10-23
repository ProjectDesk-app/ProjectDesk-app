import useSWR from 'swr';
import Layout from '@/components/Layout';
import { Flag, MessageSquare, UserPlus } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

function toTitleCase(str: string) {
  return str.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export default function NotificationsPage() {
  const { data, mutate } = useSWR('/api/notifications', fetcher);

  async function markAllRead() {
    if (!data?.length) return;
    const ids = data.filter((n: any) => !n.read).map((n: any) => n.id);
    if (!ids.length) return;
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, read: true }),
    });
    mutate();
  }

  return (
    <Layout title="Notifications">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button onClick={markAllRead} className="text-sm border px-3 py-1 rounded-md">Mark all as read</button>
      </div>

      {!data ? (
        <p>Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-gray-600">No notifications.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((n: any) => (
            <li key={n.id} className={`border rounded-md p-3 ${n.read ? '' : 'bg-yellow-50'} shadow-sm hover:shadow-md transition-shadow`}>
              <div className="text-sm flex items-center gap-2 font-medium mb-1">
                {n.type.includes('task_flagged') && <Flag className="w-4 h-4 text-yellow-600" />}
                {n.type.includes('new_comment') && <MessageSquare className="w-4 h-4 text-blue-600" />}
                {n.type.includes('task_assigned') && <UserPlus className="w-4 h-4 text-green-600" />}
                <span>{toTitleCase(n.type)}</span>
              </div>
              <div className="text-sm mb-2">{n.message}</div>
              {n.type === 'task_flagged' || n.type === 'new_comment' ? (
                <a
                  className="text-xs text-blue-700 underline cursor-pointer"
                  href={n.taskId ? `/tasks/${n.taskId}` : `/projects/${n.projectId}`}
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      const res = await fetch('/api/notifications', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: [n.id], read: true }),
                      });
                      if (res.ok) {
                        mutate();
                        setTimeout(() => {
                          window.location.href = n.taskId ? `/tasks/${n.taskId}` : `/projects/${n.projectId}`;
                        }, 150);
                      } else {
                        console.error("Failed to mark notification as read");
                      }
                    } catch (error) {
                      console.error("Error marking notification as read", error);
                    }
                  }}
                >
                  {n.type === 'new_comment' && n.taskId ? 'View Comment' : 'View Task'}
                </a>
              ) : (
                <a className="text-xs text-blue-700 underline" href={`/projects/${n.projectId}`}>
                  View Project
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}

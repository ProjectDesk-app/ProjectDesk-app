import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE === 'true') {
    const maintenanceHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>ProjectDesk | Scheduled Maintenance</title>
    <style>
      :root {
        --brand-50: #eff6ff;
        --brand-100: #dbeafe;
        --brand-600: #2563eb;
        --brand-700: #1d4ed8;
        --slate-50: #f8fafc;
        --slate-200: #e2e8f0;
        --slate-500: #64748b;
        --slate-700: #334155;
        --slate-900: #0f172a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        color: var(--slate-900);
        background:
          radial-gradient(circle at 20% 10%, rgba(37, 99, 235, 0.2), transparent 35%),
          radial-gradient(circle at 80% 90%, rgba(59, 130, 246, 0.16), transparent 30%),
          linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%);
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }

      .shell {
        width: min(980px, 100%);
        background: #ffffff;
        border: 1px solid var(--slate-200);
        border-radius: 20px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
        overflow: hidden;
      }

      .layout {
        display: grid;
        grid-template-columns: 1.1fr 1fr;
      }

      .content {
        padding: 2.75rem;
      }

      .badge {
        display: inline-block;
        margin-bottom: 1rem;
        border-radius: 999px;
        border: 1px solid var(--brand-100);
        background: var(--brand-50);
        color: var(--brand-700);
        padding: 0.35rem 0.8rem;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0 0 0.8rem;
        font-size: clamp(1.7rem, 3vw, 2.35rem);
        line-height: 1.15;
      }

      p {
        margin: 0;
        color: var(--slate-700);
        line-height: 1.65;
      }

      .meta {
        margin-top: 1.5rem;
        font-size: 0.95rem;
        color: var(--slate-500);
      }

      .art-wrap {
        position: relative;
        background: linear-gradient(145deg, #eaf2ff 0%, #f8fbff 55%, #eef4ff 100%);
        border-left: 1px solid var(--slate-200);
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }

      .logo {
        color: var(--brand-600);
        font-weight: 800;
        letter-spacing: 0.03em;
      }

      @media (max-width: 900px) {
        .layout {
          grid-template-columns: 1fr;
        }

        .art-wrap {
          border-left: 0;
          border-top: 1px solid var(--slate-200);
        }

        .content {
          padding: 2rem 1.5rem;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell" role="main" aria-labelledby="maintenance-title">
      <div class="layout">
        <section class="content">
          <div class="badge">System Update</div>
          <h1 id="maintenance-title">ProjectDesk is under maintenance</h1>
          <p>We are applying improvements to keep your workspace fast and reliable. Service will be restored shortly.</p>
          <p class="meta">Thank you for your patience while we complete this update.</p>
          <p class="meta"><span class="logo">ProjectDesk</span></p>
        </section>
        <aside class="art-wrap" aria-hidden="true">
          <svg width="320" height="250" viewBox="0 0 320 250" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="30" y="38" width="260" height="168" rx="20" fill="white" stroke="#BFDBFE" stroke-width="2"/>
            <rect x="52" y="60" width="216" height="116" rx="12" fill="#EFF6FF"/>
            <rect x="120" y="206" width="80" height="12" rx="6" fill="#93C5FD"/>
            <path d="M160 108L197 71L213 87L176 124L160 108Z" fill="#2563EB"/>
            <path d="M118 142C132 142 144 130 144 116C144 102 132 90 118 90C104 90 92 102 92 116C92 130 104 142 118 142Z" fill="#1D4ED8"/>
            <path d="M118 133C127.389 133 135 125.389 135 116C135 106.611 127.389 99 118 99C108.611 99 101 106.611 101 116C101 125.389 108.611 133 118 133Z" fill="#DBEAFE"/>
            <path d="M220 157L211 166L202 157L193 166L184 157L193 148L184 139L193 130L202 139L211 130L220 139L211 148L220 157Z" fill="#3B82F6"/>
            <circle cx="202" cy="148" r="9" fill="#EFF6FF"/>
            <path d="M85 176H235" stroke="#93C5FD" stroke-width="4" stroke-linecap="round"/>
          </svg>
        </aside>
      </div>
    </main>
  </body>
</html>`

    return new NextResponse(
      maintenanceHtml,
      {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Retry-After': '3600',
        },
      }
    )
  }

  return NextResponse.next()
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return new NextResponse(
      '<h1>Maintenance in progress</h1><p>Please check back shortly.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    )
  }

  return NextResponse.next()
}
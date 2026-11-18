'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/jobs', label: 'Job Discovery' },
  { href: '/jobs/remote', label: 'Remote Jobs' },
  { href: '/jobs/visa', label: 'Visa Sponsorship Jobs' },
  { href: '/companies', label: 'Companies' },
  { href: '/contacts', label: 'Hiring Contacts' },
  { href: '/emails', label: 'Cold Email Studio' },
  { href: '/outreach', label: 'Gmail Outreach Tracking' },
  { href: '/linkedin', label: 'LinkedIn Outreach' },
  { href: '/documents', label: 'CV & Cover Letters' },
  { href: '/applications', label: 'Applications' },
  { href: '/batches', label: 'Batch Approval Center' },
  { href: '/follow-ups', label: 'Follow-Ups' },
  { href: '/interviews', label: 'Interviews' },
  { href: '/settings', label: 'Settings' },
];

export function Sidebar({ email, gmail, pending }: { email: string; gmail: string | null; pending: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/' ? path === '/' : path === href || (path.startsWith(href + '/') && !NAV.some((n) => n.href !== href && n.href.startsWith(href) && path.startsWith(n.href))));
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:hidden">
        <span className="font-semibold">JobsApply</span>
        <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}</button>
      </div>
      <aside className={cn('fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-border bg-white lg:flex', open ? 'flex' : 'hidden')}>
        <div className="border-b border-border px-5 py-4">
          <p className="text-lg font-semibold tracking-tight">JobsApply</p>
          <p className="text-xs text-muted-foreground">Private recruitment assistant</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
              className={cn('flex items-center justify-between rounded-md px-3 py-2 text-sm', active(n.href) ? 'bg-primary/10 font-medium text-primary' : 'text-gray-700 hover:bg-muted')}>
              {n.label}
              {n.href === '/batches' && pending > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">{pending}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border px-5 py-3 text-xs">
          <p className="truncate text-muted-foreground">Signed in as {email}</p>
          <p className="mt-1 truncate">{gmail ? <span className="text-emerald-700">Gmail: {gmail}</span> : <span className="text-amber-700">Gmail not connected</span>}</p>
          <form action="/auth/signout" method="post" className="mt-2"><button className="text-primary hover:underline">Sign out</button></form>
        </div>
      </aside>
    </>
  );
}

import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'JobsApply — Private job search',
  description: 'Personal AI job search and recruitment outreach platform',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}

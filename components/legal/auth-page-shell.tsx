'use client';

import { PublicLegalFooter } from '@/components/legal/public-legal-footer';

interface AuthPageShellProps {
  children: React.ReactNode;
}

export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <div className="web-auth web-page relative flex min-h-screen flex-col overflow-hidden">
      <div aria-hidden="true" className="web-auth-decoration pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(34,197,94,0.13),transparent_34%),radial-gradient(circle_at_92%_82%,rgba(20,184,166,0.08),transparent_28%)]" />
      <div aria-hidden="true" className="web-auth-decoration pointer-events-none fixed inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      <div className="relative z-10 flex flex-1 items-center justify-center p-4 pb-3">
        {children}
      </div>
      <div className="relative z-10">
        <PublicLegalFooter />
      </div>
    </div>
  );
}

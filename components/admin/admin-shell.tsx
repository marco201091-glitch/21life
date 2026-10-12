'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManaLogo } from '@/components/ui/mana-logo';
import { AppProfileButton } from '@/components/navigation/app-profile-button';
import { useLanguage } from '@/components/language-provider';

interface AdminShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function AdminShell({ title, description, children }: AdminShellProps) {
  const { copy: t } = useLanguage();

  return (
    <div className="web-page min-h-screen min-w-0">
      <header className="web-header safe-top sticky top-0 z-10 border-b border-border/50 bg-card/50 backdrop-blur">
        <div className="web-container mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <ManaLogo size="md" showText className="hidden sm:flex" />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden truncate text-sm text-muted-foreground sm:inline">
              {t({ it: 'Area amministratore', en: 'Admin area' })}
            </span>
            <AppProfileButton />
          </div>
        </div>
      </header>

      <main className="web-container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-8">
        <div className="web-section-heading mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}
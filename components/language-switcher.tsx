'use client';

import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={cn('inline-flex items-center gap-1 rounded-md border border-border bg-background/50 p-1', className)}>
      <Languages className="ml-1 h-4 w-4 text-muted-foreground" />
      <Button
        type="button"
        size="sm"
        variant={language === 'en' ? 'secondary' : 'ghost'}
        className="h-9 min-w-9 px-2 text-xs"
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
      >
        EN
      </Button>
      <Button
        type="button"
        size="sm"
        variant={language === 'it' ? 'secondary' : 'ghost'}
        className="h-9 min-w-9 px-2 text-xs"
        onClick={() => setLanguage('it')}
        aria-pressed={language === 'it'}
      >
        IT
      </Button>
    </div>
  );
}

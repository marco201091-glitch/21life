'use client';

import { Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LiveGameModalTitle({ icon: Icon, title, onClose }: {
  icon?: typeof Trophy | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-4">
      {Icon ? <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
        <Icon className="h-5 w-5" />
      </div> : null}
      <h2 className="min-w-0 flex-1 text-lg font-black text-foreground">{title}</h2>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}


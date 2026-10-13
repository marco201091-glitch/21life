import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PanelWithActionsProps = {
  children: ReactNode;
  actions: ReactNode;
  variant?: 'default' | 'strong';
  className?: string;
};

export function PanelWithActions({
  children,
  actions,
  variant = 'default',
  className,
}: PanelWithActionsProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl',
        variant === 'strong' ? 'phyrexian-panel-strong' : 'phyrexian-panel',
        className,
      )}
    >
      <div className="min-w-0 p-4 sm:p-5">{children}</div>
      <div className="web-panel-actions grid grid-cols-2 gap-3 border-t border-border/70 p-4 sm:flex sm:p-5">
        {actions}
      </div>
    </div>
  );
}

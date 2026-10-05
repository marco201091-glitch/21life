'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ModalSize = 'md' | 'lg' | 'xl';

const modalWidths: Record<ModalSize, string> = {
  md: 'max-w-md',
  lg: 'max-w-3xl',
  xl: 'max-w-4xl',
};

type AppModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  size?: ModalSize;
};

/**
 * Accessible modal foundation for new or migrated flows.
 *
 * Uses Radix for focus trapping, Escape handling, scroll locking and screen
 * reader semantics while preserving the application's existing visual system.
 */
export function AppModal({
  open,
  onOpenChange,
  title,
  children,
  className,
  size = 'md',
}: AppModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-emerald-500/25 bg-card/95 text-card-foreground shadow-2xl shadow-black/60 backdrop-blur-xl',
            modalWidths[size],
            'max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
          <DialogPrimitive.Close
            aria-label="Close dialog"
            className="absolute right-3 top-3 rounded-lg border border-transparent p-1.5 text-muted-foreground opacity-70 transition-all hover:border-border hover:bg-accent hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ModalOverlay({
  children,
  className,
  onClose,
}: {
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}) {
  const returnFocus = React.useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null,
  );
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
          className={cn(
            'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto outline-none',
            'px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]',
            'sm:items-center sm:p-4',
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">21Life</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ModalCard({
  children,
  className,
  size = 'md',
}: {
  children: React.ReactNode;
  className?: string;
  size?: ModalSize;
}) {
  return (
    <Card
      className={cn(
        'flex w-full flex-col border-border bg-card',
        modalWidths[size],
        'max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)]',
        className,
      )}
    >
      {children}
    </Card>
  );
}

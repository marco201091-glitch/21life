'use client';

import Image from 'next/image';
import { MANA_COLOR_LABELS, getManaSymbolSvgUrl } from '@/lib/mana-colors';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/language-provider';

const SYMBOL_SIZES = {
  xs: 18,
  sm: 22,
  md: 28,
} as const;

export type ManaColorBadgeSize = keyof typeof SYMBOL_SIZES;

interface ManaColorBadgeProps {
  color: string;
  size?: ManaColorBadgeSize;
  muted?: boolean;
  title?: string;
  className?: string;
}

export function ManaColorBadge({
  color,
  size = 'sm',
  muted = false,
  title,
  className,
}: ManaColorBadgeProps) {
  const { copy: t } = useLanguage();
  const label = MANA_COLOR_LABELS[color] || MANA_COLOR_LABELS.C;
  const accessibleLabel = title ?? t(label);
  const symbolSize = SYMBOL_SIZES[size];
  const svgUrl = getManaSymbolSvgUrl(color);

  return (
    <span
      title={accessibleLabel}
      role="img"
      aria-label={accessibleLabel}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        muted && 'opacity-40 grayscale',
        className,
      )}
      style={{ width: symbolSize, height: symbolSize }}
    >
      <Image
        src={svgUrl}
        alt=""
        aria-hidden="true"
        width={symbolSize}
        height={symbolSize}
        className="block"
      />
      <span className="sr-only">{accessibleLabel}</span>
    </span>
  );
}

interface ManaColorPillsProps {
  colors: string[];
  size?: ManaColorBadgeSize;
  muted?: boolean;
  className?: string;
  gap?: 'tight' | 'normal';
}

export function ManaColorPills({
  colors,
  size = 'sm',
  muted,
  className,
  gap = 'normal',
}: ManaColorPillsProps) {
  const { copy: t } = useLanguage();

  if (colors.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center', gap === 'tight' ? 'gap-0.5' : 'gap-1', className)}>
      {colors.map((color) => {
        const label = MANA_COLOR_LABELS[color] || MANA_COLOR_LABELS.C;
        return (
          <ManaColorBadge
            key={color}
            color={color}
            size={size}
            muted={muted}
            title={t(label)}
          />
        );
      })}
    </div>
  );
}

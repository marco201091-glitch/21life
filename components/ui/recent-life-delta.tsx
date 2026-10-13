'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { accumulateLifeDelta, LIFE_DELTA_DURATION, type LifeDeltaBurst, lifeFeedback } from '@/expo/lib/life-feedback';

export function LifeReadout({ life, className, style }: { life: number; className?: string; style?: CSSProperties }) {
  const previousLife = useRef(life);
  const burst = useRef<LifeDeltaBurst | null>(null);
  const timer = useRef<number | null>(null);
  const [feedback, setFeedback] = useState({ delta: 0, key: 0, change: 0 });

  useEffect(() => {
    const change = life - previousLife.current;
    previousLife.current = life;
    if (!lifeFeedback(change)) return;
    burst.current = accumulateLifeDelta(burst.current, change, Date.now());
    const delta = burst.current.delta;
    setFeedback((current) => ({ delta, change, key: current.key + 1 }));
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      burst.current = null;
      setFeedback((current) => ({ ...current, delta: 0, change: 0 }));
    }, LIFE_DELTA_DURATION);
  }, [life]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const motion = lifeFeedback(feedback.change);
  return (
    <>
      <span aria-live="polite" aria-atomic="true" className="absolute bottom-full mb-2 text-xl font-black tabular-nums">
        {feedback.delta !== 0 && <span key={feedback.key} className={cn('inline-block life-delta-float', feedback.delta > 0 ? 'text-emerald-300' : 'text-red-400')} style={{ '--life-travel': feedback.delta > 0 ? '-10px' : '7px' } as CSSProperties}>
          {feedback.delta > 0 ? '+' : '−'}{Math.abs(feedback.delta)}
        </span>}
      </span>
      <div key={feedback.key} className={cn(className, motion && 'life-total-pulse')} style={{ ...style, '--life-scale': motion?.scale ?? 1 } as CSSProperties}>{life}</div>
    </>
  );
}

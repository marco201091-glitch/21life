import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createLiveGamePlayer } from '@/lib/live-game';

const device = vi.hoisted(() => ({ os: 'ios', width: 1024, height: 1366 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => undefined,
  useState: (initial: unknown) => [initial, () => undefined],
}));
vi.mock('react-native', () => ({
  Modal: 'Modal', View: 'View', Pressable: 'Pressable', Text: 'Text',
  Platform: { get OS() { return device.os; } },
  useWindowDimensions: () => device,
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/deck/deck-image', () => ({ DeckImage: 'Image' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/hold-pressable', () => ({ HoldPressable: 'HoldPressable' }));

import { DamageConfirmSheet } from '@/components/live-game/damage-confirm-sheet';

describe('damage dialog orientation', () => {
  for (const [os, width, height] of [['ios', 1024, 1366], ['ios', 1366, 1024], ['ios', 390, 844], ['android', 412, 915]] as const) {
    for (const rotation of [0, 90, -90, 180]) {
      it(`follows the attacker at ${rotation} degrees on ${os} ${width}x${height}`, () => {
        Object.assign(device, { os, width, height });
        const base = { slot: 0, deckId: 'deck', commander: 'Commander', commanderImage: null, startingLife: 40, allParticipantKeys: ['guest:attacker', 'guest:defender'] as const };
        const source = createLiveGamePlayer({ ...base, allParticipantKeys: [...base.allParticipantKeys], participantKey: 'guest:attacker', displayName: 'Attacker' });
        const target = createLiveGamePlayer({ ...base, allParticipantKeys: [...base.allParticipantKeys], slot: 1, participantKey: 'guest:defender', displayName: 'Defender' });
        const modal = DamageConfirmSheet({ visible: true, source, target, sourceRotation: rotation, labels: {} as Parameters<typeof DamageConfirmSheet>[0]['labels'], onClose: vi.fn(), onConfirm: vi.fn() });
        const root = modal!.props.children as ReactElement<{ children: ReactElement[] }>;
        const card = root.props.children[1] as ReactElement<{ style: Array<false | { transform?: Array<{ rotate: string }>; width?: number; height?: number }> }>;
        const transform = card.props.style.flatMap((style) => style && style.transform || []);
        expect(transform).toEqual([{ rotate: `${rotation}deg` }]);
        if (os === 'ios' && width >= 1024) {
          const size = card.props.style.find((style) => style && style.width);
          expect(size && size.width).toBe(size && size.height);
          expect(size && size.width).toBeLessThanOrEqual(Math.min(width, height) - 80);
        }
      });
    }
  }
});

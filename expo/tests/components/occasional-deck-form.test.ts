import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OccasionalDeckForm } from '@/components/table/occasional-deck-form';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, initialized: false }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value;
    }];
  },
  useMemo: (compute: () => unknown) => compute(),
  useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index]; },
  useEffect: (effect: () => void) => { if (!hooks.initialized) effect(); },
}));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch', StyleSheet: { create: (s: unknown) => s }, useWindowDimensions: () => ({ width: 1024, height: 1366 }) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('react-native-keyboard-controller', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/ui/modal', () => ({ Modal: 'Modal' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/date-field', () => ({ DateField: 'DateField' }));
vi.mock('@/components/ui/rich-text-input', () => ({ RichTextInput: 'RichTextInput' }));
vi.mock('@/components/table/match-participant-row', () => ({ MatchParticipantRow: 'ParticipantRow', toDeckOption: (deck: unknown) => deck }));
vi.mock('@/components/commander/commander-picker', () => ({ CommanderPicker: 'CommanderPicker' }));
vi.mock('@/components/ui/input', () => ({ Input: 'Input' }));
vi.mock('@/contexts/language-context', () => ({ useLanguage: () => ({ language: 'en', copy: (key: string) => key }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'stable-id' }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const service = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/occasional-decks', () => ({ createOccasionalDeck: service.create }));
type Node = ReactElement<Record<string, any>>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}

describe('occasional deck creation', () => {
 beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.initialized = false; service.create.mockReset(); });
 it('retains the commander and request ID after a network failure, then selects the created deck', async () => {
  const onCreated = vi.fn();
  const props = { groupId: 'arena', userId: 'registered', onCreated };
  const render = () => { hooks.cursor = 0; const tree = nodes(OccasionalDeckForm(props)); hooks.initialized = true; return tree; };
  render().find(n => n.type === 'Button')!.props.onPress();
  const commander = { id: 'card', name: 'Commander', imageUrl: null, colorIdentity: ['G'], oracleText: '', keywords: [], typeLine: '' };
  render().find(n => n.type === 'CommanderPicker')!.props.onSelectCommander(commander);
  service.create.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ id: 'stable-id' });
  await render().find(n => n.type === 'Button' && n.props.label === 'Create and select')!.props.onPress();
  expect(render().find(n => n.type === 'CommanderPicker')!.props.selectedCommander).toEqual(commander);
  expect(render().find(n => n.props.accessibilityRole === 'alert')).toBeDefined();
  await render().find(n => n.type === 'Button' && n.props.label === 'Create and select')!.props.onPress();
  expect(service.create.mock.calls.map(call => call[1].id)).toEqual(['stable-id', 'stable-id']);
  expect(onCreated).toHaveBeenCalledWith({ id: 'stable-id' });
  expect(render().some(n => n.type === 'CommanderPicker')).toBe(false);
 });
});

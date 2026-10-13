import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveGameConfigurator } from '@/components/live-game/live-game-configurator';
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
vi.mock('react-native', () => ({ ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', TextInput: 'Input', View: 'View', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch', StyleSheet: { create: (s: unknown) => s }, useWindowDimensions: () => ({ width: 1024, height: 1366 }) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('react-native-keyboard-controller', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/ui/modal', () => ({ Modal: 'Modal' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/date-field', () => ({ DateField: 'DateField' }));
vi.mock('@/components/ui/rich-text-input', () => ({ RichTextInput: 'RichTextInput' }));
vi.mock('@/components/table/match-participant-row', () => ({ MatchParticipantRow: 'ParticipantRow', toDeckOption: (deck: unknown) => deck }));
vi.mock('@/components/table/occasional-deck-form', () => ({ OccasionalDeckForm: 'OccasionalForm' }));

vi.mock('@/contexts/runtime-config-context', () => ({ useRuntimeConfig: () => ({ featureFlags: {} }) }));
vi.mock('@/components/deck/compact-deck-card', () => ({ CompactDeckCard: 'DeckCard' }));
vi.mock('@/components/ui/modal-header', () => ({ ModalHeader: 'ModalHeader' }));
type Node = ReactElement<Record<string, any>>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}

describe('occasional live setup selection', () => {
 beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.initialized = false; });
 it('does not implicitly prefer a sole occasional deck and locks the player until creation finishes', () => {
  const onCreated = vi.fn();
  const participants = ['a', 'b'].map(id => ({ key: `user:${id}`, name: id.toUpperCase(), decks: [{ id: `occasional-${id}`, name: 'Borrowed', commander: 'Commander', source_type: 'occasional' }], preferredDeckId: null }));
  const props = { groupId: 'arena', playerCount: 2, layoutVariant: 'classic', seats: [{ participantKey: null, deckId: null }, { participantKey: null, deckId: null }], startingLife: 40, participants, labels: { confirm: 'Confirm', next: 'Next' }, onPlayerCountChange: vi.fn(), onLayoutChange: vi.fn(), onStartingLifeChange: vi.fn(), onAssignSeat: vi.fn(), onOccasionalDeckCreated: onCreated, onReset: vi.fn(), onStart: vi.fn(), starting: false } as unknown as Parameters<typeof LiveGameConfigurator>[0];
  const render = () => { hooks.cursor = 0; const tree = nodes(LiveGameConfigurator(props)); hooks.initialized = true; return tree; };
  const player = (id: string) => render().find(n => n.type === 'Pressable' && nodes(n.props.children).some(child => child.type === 'Text' && child.props.children === id))!;
  render(); player('A').props.onPress();
  expect(render().find(n => n.type === 'Button' && n.props.label === 'Confirm')!.props.disabled).toBe(true);
  const form = render().find(n => n.type === 'OccasionalForm')!;
  form.props.onSavingChange(true);
  expect(player('B').props.disabled).toBe(true);
  player('B').props.onPress();
  expect(render().find(n => n.type === 'OccasionalForm')!.props.userId).toBe('a');
  form.props.onCreated({ id: 'created-a', user_id: 'a' });
  form.props.onSavingChange(false);
  expect(render().find(n => n.type === 'Button' && n.props.label === 'Confirm')!.props.disabled).toBe(false);
  expect(onCreated).toHaveBeenCalledWith({ id: 'created-a', user_id: 'a' });
 });
});

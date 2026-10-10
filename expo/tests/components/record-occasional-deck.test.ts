import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordMatchModal } from '@/components/table/record-match-modal';
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
  useRef: () => ({ current: null }),
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
vi.mock('@/components/table/occasional-deck-form', () => ({ OccasionalDeckForm: 'OccasionalForm' }));

type Node = ReactElement<Record<string, any>>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}

describe('manual occasional deck', () => {
 beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.initialized = false; });
 it('lets a registered player without decks create and select a deck', () => {
  const props = { groupId: 'arena', visible: true, saving: false, members: [{ id: 'a', username: 'a' }], guests: [], decks: [], matches: [], labels: {}, onClose: vi.fn(), onError: vi.fn(), onSave: vi.fn() } as unknown as Parameters<typeof RecordMatchModal>[0];
  const render = () => { hooks.cursor = 0; const tree = nodes(RecordMatchModal(props)); hooks.initialized = true; return tree; };
  render();
  render().find(n => n.type === 'ParticipantRow')!.props.onToggle();
  const form = render().find(n => n.type === 'OccasionalForm');
  expect(form?.props.userId).toBe('a');
  form!.props.onCreated({ id: 'borrowed', user_id: 'a', name: 'Borrowed', commander: 'Commander', source_type: 'occasional' });
  expect(render().find(n => n.type === 'ParticipantRow')!.props.selectedDeckId).toBe('borrowed');
 });
});

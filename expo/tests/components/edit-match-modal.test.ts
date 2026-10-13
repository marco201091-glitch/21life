import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditMatchModal } from '@/components/table/edit-match-modal';
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
function fixture() {
  const members = ['a', 'b', 'c'].map(id => ({ id, username: id, display_name: id.toUpperCase() }));
  const match = {
    id: 'match', group_id: 'group', created_by: 'a', winner_id: 'a', winner: members[0],
    notes: '', played_at: '2026-10-09T20:00:00Z', win_condition: 'concession',
    match_participants: ['a', 'b'].map(id => ({ id: `row-${id}`, user_id: id, guest_id: null, deck_id: `deck-${id}`, guest_deck_id: null, profiles: members.find(m => m.id === id) })),
  };
  const props = {
    visible: true, saving: false, canManage: true, match, members, guests: [],
    decks: members.map(m => ({ id: `deck-${m.id}`, user_id: m.id, name: `Deck ${m.id}`, commander: 'Commander' })),
    labels: { replacePlayer: 'Replace player', selectPlayer: 'Select player', save: 'Save', cancel: 'Cancel', winConditions: {} },
    onClose: vi.fn(), onError: vi.fn(), onSave: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof EditMatchModal>[0];
  const render = () => { hooks.cursor = 0; const result = EditMatchModal(props); hooks.initialized = true; return nodes(result); };
  render();
  return { props, render };
}
describe('match editor replacement layout', () => {
  beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.initialized = false; });
  it('keeps the original participant cards and hides replacement choices until requested', () => {
    const { render } = fixture();
    const tree = render();
    expect(tree.filter(n => n.type === 'ParticipantRow')).toHaveLength(2);
    expect(tree.filter(n => n.type === 'Text' && n.props.children === 'C')).toHaveLength(0);
    const triggers = tree.filter(n => n.props.testID?.startsWith('replace-player-'));
    expect(triggers).toHaveLength(2);
    triggers[0].props.onPress();
    expect(render().filter(n => n.type === 'Text' && n.props.children === 'C')).toHaveLength(1);
  });
  it('uses the replacement decks and winner when replacing the winning player', async () => {
    const { props, render } = fixture();
    render().find(n => n.props.testID === 'replace-player-row-a')!.props.onPress();
    const option = render().find(n => n.props.testID === 'replacement-row-a-user:c')!;
    option.props.onPress();
    const tree = render();
    const row = tree.find(n => n.type === 'ParticipantRow' && n.props.participantKey === 'user:c');
    expect(row?.props.displayName).toBe('C');
    expect(row?.props.selectedDeckId).toBe('deck-c');
    await tree.find(n => n.type === 'Button' && n.props.label === 'Save')!.props.onPress();
    expect(props.onError).not.toHaveBeenCalled();
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ winnerKey: 'user:c', participants: expect.arrayContaining([expect.objectContaining({ id: 'row-a', replacementKey: 'user:c' })]) }));
  });
  it('excludes original participants and replacements already used by another row', () => {
    const { render } = fixture();
    render().find(n => n.props.testID === 'replace-player-row-a')!.props.onPress();
    render().find(n => n.props.testID === 'replacement-row-a-user:c')!.props.onPress();
    render().find(n => n.props.testID === 'replace-player-row-b')!.props.onPress();
    const choices = render().filter(n => n.props.testID?.startsWith('replacement-row-b-'));
    expect(choices.map(n => n.props.testID)).toEqual(['replacement-row-b-user:b']);
  });
});

describe('occasional editor deck', () => {
  beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.initialized = false; });
  it('offers an occasional deck when a registered participant has no personal decks and preserves winner', async () => {
    const { props, render } = fixture();
    props.decks = [];
    const form = render().find(n => n.type === 'OccasionalForm' && n.props.userId === 'a');
    expect(form).toBeDefined();
    form!.props.onCreated({ id: 'occasional', user_id: 'a', name: 'Borrowed', commander: 'Commander', source_type: 'occasional' });
    const tree = render();
    expect(tree.find(n => n.type === 'ParticipantRow' && n.props.participantKey === 'user:a')?.props.selectedDeckId).toBe('occasional');
    await tree.find(n => n.type === 'Button' && n.props.label === 'Save')!.props.onPress();
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ winnerKey: 'user:a', participantDecks: expect.objectContaining({ 'user:a': 'occasional' }) }));
    props.decks = [{ id: 'personal', user_id: 'a', name: 'Personal', commander: 'Commander' }] as typeof props.decks;
    render().find(n => n.type === 'ParticipantRow' && n.props.participantKey === 'user:a')!.props.onSelectDeck('personal');
    expect(render().find(n => n.type === 'ParticipantRow' && n.props.participantKey === 'user:a')?.props.selectedDeckId).toBe('personal');
  });
});

describe('historical deck ownership after replacement', () => {
 beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.initialized = false; });
 it('does not offer the original player historical deck to their replacement', () => {
  const { props, render } = fixture();
  props.match!.match_participants[0].decks = { id: 'historical-a', name: 'Historical A', commander: 'Commander', commander_image: null, bracket: null };
  props.match!.match_participants[0].deck_id = 'historical-a';
  render().find(n => n.props.testID === 'replace-player-row-a')!.props.onPress();
  render().find(n => n.props.testID === 'replacement-row-a-user:c')!.props.onPress();
  const row = render().find(n => n.type === 'ParticipantRow' && n.props.participantKey === 'user:c')!;
  expect(row.props.filteredDecks.map((deck: { id: string }) => deck.id)).toEqual(['deck-c']);
 });
});

describe('parallel occasional creation', () => {
 beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.initialized = false; });
 it('keeps saving disabled until every registered participant request completes', () => {
  const { render } = fixture();
  const forms = render().filter(n => n.type === 'OccasionalForm');
  forms[0].props.onSavingChange(true); forms[1].props.onSavingChange(true);
  forms[0].props.onSavingChange(false);
  expect(render().find(n => n.type === 'Button' && n.props.label === 'Save')!.props.disabled).toBe(true);
  forms[1].props.onSavingChange(false);
  expect(render().find(n => n.type === 'Button' && n.props.label === 'Save')!.props.disabled).toBe(false);
 });
});

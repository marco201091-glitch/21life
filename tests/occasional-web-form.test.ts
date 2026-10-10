import { isValidElement, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { OccasionalDeckForm } from '@/components/arena/occasional-deck-form';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const backend = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = initial;
    return [hooks.values[i], (value: unknown) => { hooks.values[i] = typeof value === 'function' ? value(hooks.values[i]) : value; }]; },
  useRef: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = { current: initial }; return hooks.values[i]; },
}));
vi.mock('@/lib/supabase', () => ({ supabase: backend }));
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ copy: (value: { en: string }) => value.en }) }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/arena/guest-commander-picker', () => ({ GuestCommanderPicker: 'Picker' }));
type Node = ReactElement<Record<string, any>>;
function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!isValidElement(value)) return []; const node = value as Node; return [node, ...nodes(node.props.children)]; }
const commander = { id: 'c', name: 'Commander', imageUrl: null, colorIdentity: ['R'], typeLine: 'Legendary Creature', oracleText: 'Partner', keywords: ['Partner'] };
function fixture() {
  const props = { groupId: 'arena', userId: 'player', onCreated: vi.fn(), onBusyChange: vi.fn() };
  const render = () => { hooks.cursor = 0; return nodes(OccasionalDeckForm(props)); };
  render().find(node => node.type === 'Button')!.props.onClick();
  const picker = render().find(node => node.type === 'Picker')!;
  picker.props.onDeckNameChange('Borrowed'); picker.props.onSelectCommander(commander);
  const submit = () => render().find(node => node.type === 'Button' && node.props.children === 'Use this deck')!;
  return { props, render, submit };
}
beforeEach(() => { hooks.values = []; hooks.cursor = 0; backend.rpc.mockReset(); });
it('retains entered deck and stable creation ID after network failure', async () => {
  backend.rpc.mockReturnValueOnce({ abortSignal: async () => ({ data: null, error: { message: 'Offline' } }) });
  const { props, render, submit } = fixture();
  submit().props.onClick(); await vi.waitFor(() => expect(render().some(node => node.props.role === 'alert')).toBe(true));
  expect(render().find(node => node.type === 'Picker')!.props.deckName).toBe('Borrowed');
  const id = backend.rpc.mock.calls[0][1].p_id;
  backend.rpc.mockReturnValueOnce({ abortSignal: async () => ({ data: { id, user_id: 'player', source_type: 'occasional' }, error: null }) });
  submit().props.onClick(); await vi.waitFor(() => expect(props.onCreated).toHaveBeenCalled());
  expect(backend.rpc.mock.calls[1][1].p_id).toBe(id);
});
it('blocks double creation and reports busy state so the parent cannot save mid-creation', async () => {
  let complete!: (value: unknown) => void;
  backend.rpc.mockReturnValue({ abortSignal: () => new Promise(resolve => { complete = resolve; }) });
  const { props, render, submit } = fixture();
  const button = submit(); button.props.onClick(); button.props.onClick();
  expect(backend.rpc).toHaveBeenCalledTimes(1);
  expect(render().find(node => node.type === 'Button' && node.props.children === 'Creating...')!.props.disabled).toBe(true);
  expect(props.onBusyChange).toHaveBeenCalledWith(true);
  expect(props.onCreated).not.toHaveBeenCalled();
  complete({ data: { id: 'created' }, error: null });
  await vi.waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
});
it('sends combined partner commander identity for the registered player', async () => {
  backend.rpc.mockReturnValue({ abortSignal: async () => ({ data: { id: 'created' }, error: null }) });
  const { render, submit } = fixture();
  render().find(node => node.type === 'Picker')!.props.onSelectPartnerCommander({ ...commander, id: 'partner', name: 'Partner', colorIdentity: ['G'] });
  submit().props.onClick();
  expect(backend.rpc.mock.calls[0][1]).toMatchObject({ p_group_id: 'arena', p_user_id: 'player', p_name: 'Borrowed', p_commander: 'Commander // Partner', p_color_identity: ['R', 'G'] });
});

it('keeps creation closed while another participant context is creating a deck', () => {
  const props = { groupId: 'arena', userId: 'player', onCreated: vi.fn(), disabled: true };
  const render = () => { hooks.cursor = 0; return nodes(OccasionalDeckForm(props)); };
  const button = render().find(node => node.type === 'Button')!;
  expect(button.props.disabled).toBe(true);
  button.props.onClick();
  expect(render().some(node => node.type === 'Picker')).toBe(false);
  expect(backend.rpc).not.toHaveBeenCalled();
});

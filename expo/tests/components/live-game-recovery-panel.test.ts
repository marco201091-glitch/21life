import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', StyleSheet: { create: (s: unknown) => s } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/phyrexian-panel', () => ({ PhyrexianPanel: 'Panel' }));
import { LiveGameRecoveryPanel } from '@/components/live-game/recovery-panel';
type Node = ReactElement<{ children?: unknown; testID?: string; label?: string; disabled?: boolean; onPress?: () => void }>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
describe('recovery sync feedback', () => {
  it('shows sync progress and prevents duplicate sync or discard during the request', () => {
    const tree = nodes(LiveGameRecoveryPanel({ count: 1, language: 'en', syncing: true, error: null, onSync: vi.fn(), onDiscard: vi.fn() }));
    const actions = tree.filter(n => n.type === 'Button');
    expect(actions.map(n => n.props.disabled)).toEqual([true, true]);
    expect(actions[0].props.label).toBe('Syncing…');
  });
  it('shows the actual failure and lets the user retry without discarding data', () => {
    const onSync = vi.fn();
    const tree = nodes(LiveGameRecoveryPanel({ count: 1, language: 'it', syncing: false, error: 'Win condition does not match the live game state', onSync, onDiscard: vi.fn() }));
    expect(tree.find(n => n.props.testID === 'recovery-sync-error')?.props.children).toBe('Win condition does not match the live game state');
    const sync = tree.find(n => n.props.testID === 'recovery-sync')!;
    expect(sync.props.disabled).toBe(false);
    sync.props.onPress?.();
    expect(onSync).toHaveBeenCalledOnce();
  });
});

import { createElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
const device = vi.hoisted(() => ({ width: 1024, height: 1366 }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => [initial, vi.fn()], useEffect: () => undefined }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (s: unknown) => s }, useWindowDimensions: () => device }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/ui/modal', () => ({ Modal: 'NativeModal' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/input', () => ({ Input: 'Input' }));
vi.mock('@/components/ui/modal-header', () => ({ ModalHeader: 'Header' }));
vi.mock('@/components/commander/commander-picker', () => ({ CommanderPicker: 'CommanderPicker' }));
import { GuestDialogHost } from '@/components/table/guest-dialog-host';
import { AddGuestModal } from '@/components/table/add-guest-modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';

describe('single native guest dialog', () => {
  for (const [width, height] of [[1024, 1366], [1366, 1024], [507, 1024], [390, 844]]) {
    it(`keeps manager, editor and confirmation in one host at ${width}x${height}`, () => {
      Object.assign(device, { width, height });
      const manager = createElement('Manager'); const editor = createElement('Editor'); const alert = createElement('Alert');
      for (const [managerOpen, editorOpen, message] of [[true, false, null], [true, true, null], [true, true, alert], [false, false, alert]] as const) {
        const host = GuestDialogHost({ managerOpen, editorOpen, manager, editor, alert: message, onClose: vi.fn() });
        expect(host.type).toBe('NativeModal'); expect(host.props.visible).toBe(true);
        const [body, notification] = host.props.children as Array<ReactElement<{ children: ReactElement; style?: { display: string } }>>;
        expect(body.props.children).toBe(editorOpen ? editor : manager);
        expect(body.props.style).toEqual(message ? { display: 'none' } : undefined);
        expect(notification).toBe(message);
      }
      expect(GuestDialogHost({ managerOpen: false, editorOpen: false, manager, editor, alert: null, onClose: vi.fn() }).props.visible).toBe(false);
    });
  }
  it('renders guest forms and confirmations without another native modal', () => {
    const form = AddGuestModal({ embedded: true, visible: true, saving: false, guests: [], labels: {} as Parameters<typeof AddGuestModal>[0]['labels'], onClose: vi.fn(), onSaveCreate: vi.fn(), onSaveAddDeck: vi.fn(), onPickExisting: vi.fn(), onError: vi.fn() });
    expect(form.type).toBe('View');
    const confirmation = ConfirmModal({ embedded: true, visible: true, title: 'Delete guest?', actions: [], onClose: vi.fn() });
    expect(confirmation.type).not.toBe('NativeModal');
  });
});

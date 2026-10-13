import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SetupRestoreGate } from '@/components/live-game/setup-restore-gate';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
describe('saved setup hydration gate', () => {
 it('keeps the setup editor hidden during a pending restoration or retry', () => {
  const editor = 'setup-editor';
  expect(SetupRestoreGate({ ready: false, error: false, language: 'en', onRetry: vi.fn(), children: editor })).not.toBe(editor);
  expect(SetupRestoreGate({ ready: false, error: true, language: 'en', onRetry: vi.fn(), children: editor })).not.toBe(editor);
  expect(SetupRestoreGate({ ready: true, error: false, language: 'en', onRetry: vi.fn(), children: editor })).toBe(editor);
 });
 it('offers a localized explicit retry after a network failure', () => {
  const retry = vi.fn();
  const result = SetupRestoreGate({ ready: false, error: true, language: 'it', onRetry: retry, children: 'editor' });
  expect(isValidElement(result)).toBe(true);
  if (!isValidElement<{children: React.ReactElement<{label: string; onPress: () => void}>[]}>(result)) throw Error('Expected gate');
  const button = result.props.children[1];
  expect(button.props.label).toBe('Riprova');
  button.props.onPress(); expect(retry).toHaveBeenCalledOnce();
 });
});

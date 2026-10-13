import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/ui/modal';

type GuestDialogHostProps = {
  managerOpen: boolean;
  editorOpen: boolean;
  manager: ReactNode;
  editor: ReactNode;
  alert: ReactNode | null;
  onClose: () => void;
};

/** iOS must not present a second native modal over the guest manager. */
export function GuestDialogHost({ managerOpen, editorOpen, manager, editor, alert, onClose }: GuestDialogHostProps) {
  return (
    <Modal visible={managerOpen || editorOpen || Boolean(alert)} onClose={onClose}>
      {/* Keep the form mounted while an error/confirmation is displayed. */}
      <View style={alert ? { display: 'none' } : undefined}>
        {editorOpen ? editor : manager}
      </View>
      {alert}
    </Modal>
  );
}

import type { ComponentProps } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ModalHeader } from '@/components/ui/modal-header';
import { colors, radii, spacing } from '@/constants/theme';
import { isPhoneViewport } from '@/lib/layout';

type ConfirmAction = {
  label: string;
  variant?: 'primary' | 'ghost' | 'outline' | 'destructive';
  onPress: () => void;
  disabled?: boolean;
};

type ConfirmModalProps = {
  visible: boolean;
  /** Reuse the enclosing native modal for nested confirmation flows. */
  embedded?: boolean;
  title: string;
  message?: string;
  actions: ConfirmAction[];
  onClose: () => void;
  icon?: ComponentProps<typeof ModalHeader>['icon'];
  tone?: ComponentProps<typeof ModalHeader>['tone'];
};

export function ConfirmModal({
  visible,
  embedded = false,
  title,
  message,
  actions,
  onClose,
  icon,
  tone,
}: ConfirmModalProps) {
  const { width } = useWindowDimensions();
  const resolvedTone = tone ?? (actions.some((action) => action.variant === 'destructive') ? 'danger' : 'default');
  const stackActions = actions.length > 2 || (isPhoneViewport(width) && width < 400);

  const footer = (
    <View style={[styles.actions, stackActions && styles.actionsStacked]}>
      {actions.map((action, index) => (
        <Button
          key={`${action.label}-${index}`}
          label={action.label}
          variant={action.variant ?? (index === actions.length - 1 ? 'primary' : 'ghost')}
          onPress={action.onPress}
          disabled={action.disabled}
          style={styles.actionButton}
        />
      ))}
    </View>
  );
  const content = (
    <>
      <ModalHeader
        title={title}
        icon={icon ?? (resolvedTone === 'danger' ? 'warning-outline' : 'help-circle-outline')}
        tone={resolvedTone}
        onClose={onClose}
      />
      {message ? (
        <View style={styles.messageCard}>
          <Text style={styles.message}>{message}</Text>
        </View>
      ) : null}
    </>
  );
  return embedded ? <>{content}{footer}</> : (
    <Modal visible={visible} onClose={onClose} presentation="dialog" maxWidth={480} footer={footer}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  messageCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardInset,
    padding: spacing.md,
  },
  message: {
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  actionButton: {
    flex: 1,
  },
});

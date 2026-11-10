import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { Link, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, Switch, Text, View } from 'react-native';
import { showAppAlert } from '@/lib/app-alert';
import { isPasswordPolicyValid, PasswordRequirements } from '@/components/auth/password-requirements';
import { Button } from '@/components/ui/button';
import { FilterChip } from '@/components/ui/filter-chip';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PhyrexianPanel } from '@/components/ui/phyrexian-panel';
import { SectionHeader } from '@/components/ui/section-header';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { useLanguage } from '@/contexts/language-context';
import { ManaLogo } from '@/components/ui/mana-logo';
import { useProfile } from '@/hooks/use-profile';
import type { AppLanguage } from '@/lib/i18n/types';
import { isGoogleAuthUser } from '@/lib/oauth-profile';
import { getProfileDisplayName } from '@/lib/profile-display';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';
import { supabase } from '@/lib/supabase';
import { hapticSuccess } from '@/lib/haptics';
import { APP_DISPLAY_VERSION } from '@/lib/app-version';
import { FAN_CONTENT_NOTICE } from '@/lib/legal-site';
import { apiGet, apiPost } from '@/lib/api';
import { colors, spacing } from '@/constants/theme';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
  type AccessibilityPreferences,
} from '@/lib/accessibility-preferences';
import { runArchidektAutoSync } from '@/lib/archidekt-auto-sync';

export default function SettingsScreen() {
  const { copy, language, setLanguage } = useLanguage();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { profile, updateDisplayName, refresh: refreshProfile } = useProfile(user?.id);
  const { showToast } = useToast();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exportingAccount, setExportingAccount] = useState(false);
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const [archidektUsername, setArchidektUsername] = useState('');
  const [archidektAutoImport, setArchidektAutoImport] = useState(false);
  const [savingArchidektSettings, setSavingArchidektSettings] = useState(false);

  useEffect(() => {
    void loadAccessibilityPreferences().then(setAccessibility);
  }, []);

  useEffect(() => {
    if (!profile) return;
    setArchidektUsername(profile.archidekt_username || '');
    setArchidektAutoImport(Boolean(profile.archidekt_auto_import));
  }, [profile]);

  const updateReducedMotion = (value: boolean) => {
    const next = { ...accessibility, reducedMotion: value };
    setAccessibility(next);
    void saveAccessibilityPreferences(next);
  };

  const languageOptions: { id: AppLanguage; label: string }[] = [
    { id: 'en', label: copy('english') },
    { id: 'it', label: copy('italian') },
  ];
  const currentLanguageLabel = languageOptions.find((option) => option.id === language)?.label ?? copy('language');

  const passwordsMatch = newPassword === confirmNewPassword && confirmNewPassword.length > 0;
  const canSavePassword = isPasswordPolicyValid(newPassword) && passwordsMatch && currentPassword.length > 0;
  const deleteNeedsPassword = !isGoogleAuthUser(user);
  const canDeleteAccount = deleteConfirmation.trim().length > 0;

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      showAppAlert(copy('error'), copy('unableToUpdatePassword'));
      return;
    }

    if (!passwordsMatch) {
      showAppAlert(copy('error'), copy('passwordsDoNotMatch'));
      return;
    }

    setSavingPassword(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verifyError) {
        throw new Error(copy('currentPasswordIncorrect'));
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      resetPasswordForm();
      setShowPasswordModal(false);
      void hapticSuccess();
      showToast(copy('passwordChangedSuccess'));
    } catch (error) {
      showAppAlert(
        copy('error'),
        error instanceof Error ? error.message : getSupabaseErrorMessage(error, copy('unableToUpdatePassword')),
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const openEditName = () => {
    setDisplayNameDraft(profile?.display_name || '');
    setShowEditNameModal(true);
  };

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await updateDisplayName(displayNameDraft);
      setShowEditNameModal(false);
      void hapticSuccess();
      showToast(copy('profileUpdated'));
    } catch (error) {
      showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('updateProfileFailed')));
    } finally {
      setSavingName(false);
    }
  };

  const handleLanguageChange = async (nextLanguage: AppLanguage) => {
    await setLanguage(nextLanguage);
    setShowLanguageModal(false);
    void hapticSuccess();
  };

  const saveArchidektSettings = async () => {
    if (!user) return;
    const username = archidektUsername.trim();
    setSavingArchidektSettings(true);
    try {
      const { error } = await supabase.from('profiles').update({
        archidekt_username: username || null,
      }).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      void hapticSuccess();
      showToast(copy('profileUpdated'));
    } catch (error) {
      showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('archidektSyncFailed')));
    } finally {
      setSavingArchidektSettings(false);
    }
  };

  const handleArchidektAutoImportChange = async (enabled: boolean) => {
    if (!user) return;
    const previous = archidektAutoImport;
    setArchidektAutoImport(enabled);
    try {
      const { error } = await supabase.from('profiles').update({ archidekt_auto_import: enabled }).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      if (enabled && archidektUsername.trim()) void runArchidektAutoSync(user.id, { force: true });
    } catch (error) {
      setArchidektAutoImport(previous);
      showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('updateProfileFailed')));
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    setDeletingAccount(true);
    try {
      const response = await apiPost<{ ok: true }>('/api/auth/delete-account', {
        password: deleteNeedsPassword ? deleteConfirmation : undefined,
        confirmation: deleteNeedsPassword ? undefined : deleteConfirmation,
      });

      if (response.error || response.status >= 400) {
        throw new Error(response.status === 403
          ? copy('accountConfirmationFailed')
          : copy('deleteAccountFailed'));
      }

      await supabase.auth.signOut({ scope: 'local' });
      setShowDeleteAccountModal(false);
      setDeleteConfirmation('');
      router.replace('/(auth)/login');
    } catch (error) {
      showAppAlert(
        copy('error'),
        error instanceof Error ? error.message : copy('deleteAccountFailed'),
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleExportAccount = async () => {
    setExportingAccount(true);
    try {
      const response = await apiGet<Record<string, unknown>>('/api/auth/export-account');
      if (response.error || response.status >= 400 || !response.data) {
        throw new Error(copy('exportAccountFailed'));
      }
      const contents = JSON.stringify(response.data, null, 2);
      if (FileSystem.cacheDirectory && await Sharing.isAvailableAsync()) {
        const path = `${FileSystem.cacheDirectory}mtg-tracker-account-${new Date().toISOString().slice(0, 10)}.json`;
        await FileSystem.writeAsStringAsync(path, contents, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: copy('exportAccount') });
        await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
      } else {
        await Share.share({ title: copy('exportAccount'), message: contents });
      }
    } catch (error) {
      showAppAlert(copy('error'), error instanceof Error ? error.message : copy('exportAccountFailed'));
    } finally {
      setExportingAccount(false);
    }
  };

  return (
    <Screen>
      <View style={styles.branding}>
        <ManaLogo
          size="sm"
          showText
          layout="horizontal"
          centered
        />
      </View>

      <PhyrexianPanel style={styles.card}>
        <SectionHeader title={copy('profile')} />
        <View style={styles.profileHeader}>
          <Text style={styles.displayName}>{getProfileDisplayName(profile)}</Text>
          {profile?.username ? (
            <Text style={styles.username}>@{profile.username}</Text>
          ) : null}
        </View>

        <View style={styles.profileActions}>
          <Button label={copy('editDisplayName')} variant="ghost" onPress={openEditName} />
          {!isGoogleAuthUser(user) ? (
            <Button
              label={copy('changePassword')}
              variant="ghost"
              onPress={() => {
                resetPasswordForm();
                setShowPasswordModal(true);
              }}
            />
          ) : null}
          <Button
            label={`${copy('language')} · ${currentLanguageLabel}`}
            variant="ghost"
            icon="language-outline"
            onPress={() => setShowLanguageModal(true)}
          />
        </View>
      </PhyrexianPanel>

      <PhyrexianPanel style={styles.card}>
        <SectionHeader title={copy('notifications')} />
        <Button
          label={copy('notificationPreferences')}
          variant="ghost"
          icon="notifications-outline"
          onPress={() => router.push('./notification-settings')}
        />
      </PhyrexianPanel>

      <CollapsiblePanel title={copy('archidektSync')}>
        <Text style={styles.preferenceHint}>{copy('archidektPublicHint')}</Text>
        <Input
          label={copy('archidektUsername')}
          value={archidektUsername}
          onChangeText={setArchidektUsername}
          placeholder={copy('archidektUsernamePlaceholder')}
          autoCapitalize="none"
        />
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>{copy('autoUpdate')}</Text>
            {profile?.archidekt_last_sync_at ? (
              <Text style={styles.preferenceHint}>
                {new Date(profile.archidekt_last_sync_at).toLocaleString(language === 'it' ? 'it-IT' : 'en-US')}
              </Text>
            ) : null}
          </View>
          <Switch
            value={archidektAutoImport}
            onValueChange={(value) => void handleArchidektAutoImportChange(value)}
            trackColor={{ true: colors.primary }}
          />
        </View>
        <Button
          label={savingArchidektSettings ? copy('saving') : copy('save')}
          onPress={() => void saveArchidektSettings()}
          disabled={savingArchidektSettings}
          style={styles.archidektSave}
        />
      </CollapsiblePanel>

      <PhyrexianPanel style={[styles.card, styles.accessibilityCard]}>
        <SectionHeader title={copy('accessibility')} />
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>{copy('reducedMotion')}</Text>
            <Text style={styles.preferenceHint}>{copy('disabledByDefault')}</Text>
          </View>
          <Switch
            value={accessibility.reducedMotion}
            onValueChange={updateReducedMotion}
            trackColor={{ true: colors.primary }}
          />
        </View>
      </PhyrexianPanel>

      <CollapsiblePanel title={copy('legalDocuments')}>
        <Link href={{ pathname: '/legal/[slug]', params: { slug: 'privacy' } }} style={styles.legalLink}>{copy('privacyPolicy')}</Link>
        <Link href={{ pathname: '/legal/[slug]', params: { slug: 'terms' } }} style={styles.legalLink}>{copy('termsOfUse')}</Link>
        <Link href={{ pathname: '/legal/[slug]', params: { slug: 'cookies' } }} style={styles.legalLink}>{copy('cookiePolicy')}</Link>
        <Text style={styles.legalNotice}>{FAN_CONTENT_NOTICE}</Text>
      </CollapsiblePanel>

      <Button
        label={exportingAccount ? copy('exportingAccount') : copy('exportAccount')}
        variant="ghost"
        icon="download-outline"
        disabled={exportingAccount}
        onPress={() => void handleExportAccount()}
        style={styles.logout}
      />
      <Button label={copy('logout')} variant="ghost" onPress={() => void signOut().catch(() => showAppAlert(copy('error'), language==='it' ? 'Impossibile scollegare le notifiche. Controlla la connessione e riprova.' : 'Could not disconnect notifications. Check your connection and try again.'))} style={styles.logout} />
      <Button
        label={copy('deleteAccount')}
        variant="destructive"
        icon="trash-outline"
        onPress={() => {
          setDeleteConfirmation('');
          setShowDeleteAccountModal(true);
        }}
        style={styles.deleteAccount}
      />

      <Text style={styles.version}>
        {copy('appVersion')} {APP_DISPLAY_VERSION}
      </Text>

      <Modal visible={showLanguageModal} onClose={() => setShowLanguageModal(false)}>
        <Text style={styles.modalTitle}>{copy('language')}</Text>
        <View style={styles.languageRow}>
          {languageOptions.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={language === option.id}
              onPress={() => void handleLanguageChange(option.id)}
            />
          ))}
        </View>
        <Button
          label={copy('cancel')}
          variant="ghost"
          onPress={() => setShowLanguageModal(false)}
          style={styles.modalCancel}
        />
      </Modal>

      <Modal visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} footer={(        <View style={styles.modalActions}>
          <Button
            label={copy('cancel')}
            variant="ghost"
            onPress={() => setShowPasswordModal(false)}
            style={styles.modalButton}
          />
          <Button
            label={savingPassword ? copy('saving') : copy('changePassword')}
            onPress={handleChangePassword}
            disabled={savingPassword || !canSavePassword}
            style={styles.modalButton}
          />
        </View>)}>
        <Text style={styles.modalTitle}>{copy('changePassword')}</Text>
        <Input
          label={copy('currentPassword')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoComplete="current-password"
          importantForAutofill="yes"
        />
        <Input
          label={copy('newPassword')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={newPassword}
          onChangeText={setNewPassword}
          autoComplete="new-password"
          importantForAutofill="yes"
        />
        <PasswordRequirements password={newPassword} />
        <Input
          label={copy('confirmNewPassword')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={confirmNewPassword}
          onChangeText={setConfirmNewPassword}
          autoComplete="new-password"
          importantForAutofill="yes"
        />
        {confirmNewPassword.length > 0 && !passwordsMatch ? (
          <Text style={styles.error}>{copy('passwordsDoNotMatch')}</Text>
        ) : null}

      </Modal>

      <Modal visible={showEditNameModal} onClose={() => setShowEditNameModal(false)} footer={(        <View style={styles.modalActions}>
          <Button label={copy('cancel')} variant="ghost" onPress={() => setShowEditNameModal(false)} style={styles.modalButton} />
          <Button
            label={savingName ? copy('saving') : copy('save')}
            disabled={savingName}
            onPress={handleSaveName}
            style={styles.modalButton}
          />
        </View>)}>
        <Text style={styles.modalTitle}>{copy('editDisplayName')}</Text>
        <Input
          label={copy('displayName')}
          value={displayNameDraft}
          onChangeText={setDisplayNameDraft}
          placeholder={copy('displayNamePlaceholder')}
        />

      </Modal>

      <Modal
        visible={showDeleteAccountModal}
        onClose={() => {
          if (!deletingAccount) setShowDeleteAccountModal(false);
        }}
      >
        <Text style={styles.modalTitle}>{copy('deleteAccountTitle')}</Text>
        <Text style={styles.deleteAccountHint}>{copy('deleteAccountHint')}</Text>
        <Input
          label={deleteNeedsPassword ? copy('currentPassword') : copy('confirmAccountEmail')}
          secureTextEntry={deleteNeedsPassword}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={deleteNeedsPassword ? 'default' : 'email-address'}
          value={deleteConfirmation}
          onChangeText={setDeleteConfirmation}
          autoComplete={deleteNeedsPassword ? 'current-password' : 'email'}
          importantForAutofill={deleteNeedsPassword ? 'yes' : 'auto'}
        />
        <View style={styles.modalActions}>
          <Button
            label={copy('cancel')}
            variant="ghost"
            disabled={deletingAccount}
            onPress={() => setShowDeleteAccountModal(false)}
            style={styles.modalButton}
          />
          <Button
            label={deletingAccount ? copy('deletingAccount') : copy('deleteAccount')}
            variant="destructive"
            disabled={deletingAccount || !canDeleteAccount}
            onPress={() => void handleDeleteAccount()}
            style={styles.modalButton}
          />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  branding: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  profileHeader: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileActions: {
    gap: spacing.sm,
  },
  displayName: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  username: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  languageRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  legalLink: {
    color: colors.primaryLight,
    fontWeight: '600',
    fontSize: 15,
  },
  legalNotice: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  error: {
    color: colors.destructive,
    fontSize: 12,
  },
  logout: {
    marginTop: spacing.xs,
  },
  deleteAccount: {
    marginTop: spacing.sm,
  },
  deleteAccountHint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  version: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
  },
  modalTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalButton: {
    flex: 1,
    minWidth: 132,
  },
  modalCancel: {
    marginTop: spacing.xs,
  },
  preferenceRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  preferenceCopy: {
    flex: 1,
  },
  preferenceLabel: {
    color: colors.foreground,
    fontWeight: '700',
  },
  preferenceHint: {
    color: colors.muted,
    fontSize: 12,
  },
  accessibilityCard: {
    marginTop: spacing.md,
  },
  archidektSave: {
    marginTop: spacing.sm,
  },
});

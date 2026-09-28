import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/language-context';
import { localizeNotification } from '@/lib/notification-copy';

export function AppNotificationListener() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { language } = useLanguage();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`app-notifications:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'app_notifications',
        filter: `user_id=eq.${user.id}`,
      }, (event) => {
        const item = event.new as { type?: 'arena_invite' | 'arena_member_joined' | 'match_completed'; title: string; body: string; data?: Record<string, unknown> };
        const localized = localizeNotification(item, language);
        showToast([localized.title, localized.body].filter(Boolean).join(' · '), 'info');
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [language, showToast, user]);

  return null;
}

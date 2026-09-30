import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { processArchidektSyncRequests, runArchidektAutoSync } from '@/lib/archidekt-auto-sync';
import { supabase } from '@/lib/supabase';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function ArchidektAutoSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let active = true;

    const sync = () => {
      if (!active) return;
      void Promise.all([
        runArchidektAutoSync(user.id),
        processArchidektSyncRequests(user.id),
      ])
        .then((result) => {
          const syncResult = result[0];
          if (syncResult.inserted > 0 || syncResult.updated > 0 || syncResult.skipped > 0) {
            console.info('Archidekt background sync completed', syncResult);
          }
        })
        .catch((error) => {
          console.warn(
            'Archidekt background sync failed',
            error instanceof Error ? error.message : error,
          );
        });
    };

    const channel = supabase
      .channel(`archidekt-sync-requests:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'archidekt_sync_requests',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        void processArchidektSyncRequests(user.id).catch((error) => {
          console.warn(
            'Requested Archidekt sync failed',
            error instanceof Error ? error.message : error,
          );
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void processArchidektSyncRequests(user.id).catch((error) => {
            console.warn(
              'Requested Archidekt sync failed',
              error instanceof Error ? error.message : error,
            );
          });
        }
      });

    sync();
    const interval = setInterval(sync, CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}

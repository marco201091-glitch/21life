'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManaLogo } from '@/components/ui/mana-logo';
import { PasswordRequirements, isPasswordPolicyValid } from '@/components/auth/password-requirements';
import { useLanguage } from '@/components/language-provider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { AuthPageShell } from '@/components/legal/auth-page-shell';

function ResetPasswordForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { copy: t } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const isPasswordValid = isPasswordPolicyValid(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  useEffect(() => {
    const establishSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
        } else if (window.location.hash.includes('access_token=')) {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) {
              throw error;
            }
          }
        }

        const { data: { user } } = await supabase.auth.getUser();
        setSessionReady(Boolean(user));
      } catch {
        setSessionReady(false);
      } finally {
        setCheckingSession(false);
      }
    };

    void establishSession();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isPasswordValid || !passwordsMatch) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw error;
      }

      toast({
        title: t({ it: 'Password aggiornata', en: 'Password updated' }),
        description: t({
          it: 'Ora puoi accedere con la nuova password.',
          en: 'You can now sign in with your new password.',
        }),
      });

      router.replace('/dashboard');
      router.refresh();
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({
          it: 'Impossibile aggiornare la password.',
          en: 'Unable to update password.',
        }),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <AuthPageShell>
        <Card className="w-full max-w-xl border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t({ it: 'Verifica link in corso...', en: 'Verifying link...' })}
          </CardContent>
        </Card>
      </AuthPageShell>
    );
  }

  if (!sessionReady) {
    return (
      <AuthPageShell>
        <Card className="w-full max-w-xl border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-5 text-center">
            <div className="flex justify-center">
              <ManaLogo size="xl" showText layout="stacked" subtitle="Tracker & Analytics" className="w-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t({
                it: 'Questo link non è valido o è scaduto. Richiedine uno nuovo.',
                en: 'This link is invalid or expired. Request a new one.',
              })}
            </p>
            <Button asChild className="w-full bg-gradient-to-r from-emerald-600 to-teal-700">
              <Link href="/auth/forgot-password">
                {t({ it: 'Richiedi nuovo link', en: 'Request a new link' })}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <Card className="w-full max-w-xl border-border/50 bg-card/80 backdrop-blur">
        <CardHeader className="pb-5 text-center">
          <div className="flex justify-center">
            <ManaLogo size="xl" showText layout="stacked" subtitle="Tracker & Analytics" className="w-full" />
          </div>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-foreground">
                {t({ it: 'Nuova password', en: 'New password' })}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t({
                  it: 'Scegli una nuova password per il tuo account.',
                  en: 'Choose a new password for your account.',
                })}
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                {t({ it: 'Password', en: 'Password' })}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                className="border-border bg-background/50 text-foreground placeholder:text-muted-foreground"
              />
              <PasswordRequirements password={password} />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                {t({ it: 'Conferma password', en: 'Confirm password' })}
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                className="border-border bg-background/50 text-foreground placeholder:text-muted-foreground"
              />
              {confirmPassword.length > 0 && !passwordsMatch ? (
                <p className="text-xs text-destructive">
                  {t({ it: 'Le password non coincidono.', en: 'Passwords do not match.' })}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800"
              disabled={loading || !isPasswordValid || !passwordsMatch}
            >
              {loading
                ? t({ it: 'Salvataggio...', en: 'Saving...' })
                : t({ it: 'Salva nuova password', en: 'Save new password' })}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

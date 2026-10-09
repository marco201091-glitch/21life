'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getRememberMePreference, setRememberMePreference } from '@/lib/auth-persistence';
import { clearSupabaseAuthStorage } from '@/lib/supabase-auth-recovery';
import { resetSupabaseClient, supabase } from '@/lib/supabase';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ManaLogo } from '@/components/ui/mana-logo';
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { signInWithGoogle } from '@/lib/google-auth';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { DemoLoginButton } from '@/components/auth/demo-login-button';
import { AuthPageShell } from '@/components/legal/auth-page-shell';
import { useLanguage } from '@/components/language-provider';

function LoginForm() {
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const router = useRouter();
  const { copy: t } = useLanguage();

  useEffect(() => {
    setRememberMe(getRememberMePreference());
    setReady(true);
  }, []);

  const searchParams = useSearchParams();
  const { toast } = useToast();
  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (!oauthError) return;

    toast({
      title: t({ it: 'Errore', en: 'Error' }),
      description: oauthError,
      variant: 'destructive',
    });
  }, [searchParams, t, toast]);
  const redirectPath = getSafeRedirectPath(searchParams.get('redirect'));
  const invalidCredentialsMessage = t({ it: 'Credenziali non valide.', en: 'Invalid credentials.' });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier.trim(),
          password,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        accessToken?: string;
        refreshToken?: string;
      };
      if (!response.ok || !payload.accessToken || !payload.refreshToken) {
        throw new Error(invalidCredentialsMessage);
      }

      setRememberMePreference(rememberMe);
      clearSupabaseAuthStorage();
      resetSupabaseClient();

      const { error } = await supabase.auth.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
      });

      if (error) throw error;

      router.refresh();
      router.push(redirectPath);
    } catch {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: invalidCredentialsMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle(redirectPath);
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error
          ? error.message
          : t({ it: 'Accesso con Google non riuscito', en: 'Failed to sign in with Google' }),
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <AuthPageShell>
      <Card className="relative w-full max-w-xl overflow-hidden border-emerald-400/20 bg-[linear-gradient(155deg,rgba(24,24,33,0.96),rgba(10,10,15,0.94))] shadow-[0_30px_100px_rgba(0,0,0,0.58),0_0_80px_rgba(34,197,94,0.07)] backdrop-blur-xl">
        <div aria-hidden="true" className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-emerald-500/[0.08] blur-3xl" />
        <CardHeader className="relative pb-6 pt-8 text-center sm:pt-9">
          <div className="flex justify-center">
            <ManaLogo
              size="xl"
              showText
              layout="stacked"
              title="21Life"
              subtitle="TRACKER & ANALYTICS"
              className="w-full"
            />
          </div>
        </CardHeader>
        <CardContent className="relative px-5 pb-7 sm:px-6 sm:pb-8">
          <form method="post" onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="loginIdentifier" className="text-sm font-medium text-foreground">
                {t({ it: 'Email o username', en: 'Email or username' })}
              </label>
              <Input
                id="loginIdentifier"
                disabled={!ready}
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                placeholder={t({ it: 'Username o email', en: 'Username or email' })}
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                required
                className="h-11 rounded-xl border-border/80 bg-black/25 text-foreground placeholder:text-muted-foreground focus-visible:border-emerald-400/60"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  {t({ it: 'Password', en: 'Password' })}
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  {t({ it: 'Password dimenticata?', en: 'Forgot password?' })}
                </Link>
              </div>
              <Input
                id="password"
                disabled={!ready}
                name="password"
                type="password"
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 rounded-xl border-border/80 bg-black/25 text-foreground placeholder:text-muted-foreground focus-visible:border-emerald-400/60"
              />
            </div>
            <label
              htmlFor="rememberMe"
              className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/70 bg-black/20 px-3 py-2.5 text-sm text-foreground transition-colors hover:border-emerald-400/30 hover:bg-emerald-500/5"
            >
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                className="border-emerald-400/70 data-[state=checked]:border-emerald-400 data-[state=checked]:bg-emerald-600"
              />
              <span>{t({ it: 'Ricordami su questo dispositivo', en: 'Remember me on this device' })}</span>
            </label>
            <Button
              type="submit"
              className="h-11 w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 font-semibold text-white shadow-[0_10px_28px_rgba(5,150,105,0.2)] hover:from-emerald-500 hover:to-teal-600"
              disabled={!ready || loading}
            >
              {loading
                ? t({ it: 'Accesso...', en: 'Signing in...' })
                : t({ it: 'Entra', en: 'Enter' })}
            </Button>
          </form>

          <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t({ it: 'Oppure continua con', en: 'Or continue with' })}</span>
                </div>
              </div>

              <GoogleSignInButton
                disabled={!ready || loading}
                onClick={handleGoogleLogin}
                label={{ it: 'Continua con Google', en: 'Continue with Google' }}
              />

              <DemoLoginButton disabled={!ready || loading} redirectPath={redirectPath} />
              <Button asChild variant="outline" className="mt-3 w-full border-cyan-400/30 text-cyan-100">
                <Link href="/counter">{t({ it: 'Partita veloce', en: 'Quick game' })}</Link>
              </Button>
          </>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {t({ it: 'Non sei ancora registrato?', en: 'Not registered yet?' })}{' '}
            <Link href={`/auth/register?redirect=${encodeURIComponent(redirectPath)}`} className="text-emerald-400 hover:text-emerald-300 font-medium">
              {t({ it: 'Crea un account', en: 'Create one' })}
            </Link>
          </div>

        </CardContent>
      </Card>
    </AuthPageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

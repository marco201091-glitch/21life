'use client';

import { Suspense, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import { PasswordRequirements } from '@/components/auth/password-requirements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ManaLogo } from '@/components/ui/mana-logo';
import { useLanguage } from '@/components/language-provider';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabase } from '@/lib/supabase';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { AuthPageShell } from '@/components/legal/auth-page-shell';
import { RegisterTermsNotice } from '@/components/legal/register-terms-notice';
import {
  registerSchema,
  type RegisterValues,
} from '@/lib/validation/auth';

function RegisterForm() {
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [captchaAvailable, setCaptchaAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { copy: t, language } = useLanguage();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isValid },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
    defaultValues: { username: '', email: '', password: '' },
  });
  const username = useWatch({ control, name: 'username' });
  const email = useWatch({ control, name: 'email' });
  const password = useWatch({ control, name: 'password' });
  const redirectPath = getSafeRedirectPath(searchParams.get('redirect'));
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const isCaptchaReady = Boolean(turnstileSiteKey && captchaToken && captchaAvailable);

  const resetCaptcha = () => {
    setCaptchaToken('');
    setCaptchaResetSignal((signal) => signal + 1);
  };

  const handleRegister = async ({ email, password, username }: RegisterValues) => {
    if (!isCaptchaReady) {
      toast({
        title: t({ it: 'Verifica richiesta', en: 'Verification required' }),
        description: t({
          it: 'Completa il captcha prima di creare l\'account.',
          en: 'Complete the captcha before creating your account.',
        }),
      });
      return;
    }

    setLoading(true);

    try {
      const registerResponse = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          username: username.trim(),
          captchaToken,
          locale: language,
        }),
      });

      const registerData = await registerResponse.json() as { error?: string };
      if (!registerResponse.ok) {
        throw new Error(registerData.error || t({ it: 'Creazione account non riuscita', en: 'Failed to create account' }));
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      toast({
        title: t({ it: 'Account creato', en: 'Account created' }),
        description: t({
          it: 'Registrazione completata. Ti stiamo portando alla dashboard.',
          en: 'Registration complete. Taking you to the dashboard.',
        }),
      });
      router.push(redirectPath);
    } catch (error: unknown) {
      resetCaptcha();
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({ it: 'Creazione account non riuscita', en: 'Failed to create account' }),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setLoading(true);
    try {
      await signInWithGoogle(redirectPath);
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error
          ? error.message
          : t({ it: 'Registrazione con Google non riuscita', en: 'Failed to sign up with Google' }),
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <AuthPageShell>
      <Card className="w-full max-w-xl bg-card/80 border-border/50 backdrop-blur">
        <CardHeader className="pb-5 text-center">
          <div className="flex justify-center">
            <ManaLogo size="xl" showText layout="stacked" subtitle="Tracker & Analytics" className="w-full" />
          </div>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={handleSubmit(handleRegister)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-foreground">
                {t({ it: 'Nome utente', en: 'Username' })}
              </label>
              <Input
                id="username"
                type="text"
                placeholder="Newt"
                {...register('username')}
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]{3,30}"
                autoComplete="username"
                aria-invalid={Boolean(errors.username)}
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
              />
              {username.length > 0 && errors.username && (
                <p className="text-xs text-destructive">
                  {t({
                    it: 'Usa solo lettere, numeri o underscore.',
                    en: 'Use only letters, numbers, or underscores.',
                  })}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="planeswalker@phyrexia.com"
                {...register('email')}
                required
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
              />
              {email.length > 0 && errors.email && (
                <p className="text-xs text-destructive">
                  {t({ it: 'Inserisci una mail valida.', en: 'Enter a valid email address.' })}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                {t({ it: 'Password', en: 'Password' })}
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                required
                minLength={8}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(errors.password)}
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
              />
              <PasswordRequirements password={password} />
            </div>
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              onVerify={(token) => {
                setCaptchaAvailable(true);
                setCaptchaToken(token);
              }}
              onExpire={() => setCaptchaToken('')}
              onError={() => {
                setCaptchaAvailable(false);
                setCaptchaToken('');
              }}
              resetSignal={captchaResetSignal}
              unavailableLabel={t({
                it: 'Verifica anti-bot non disponibile. Riprova tra poco.',
                en: 'Bot check unavailable. Please try again shortly.',
              })}
            />
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-semibold"
              disabled={loading || !isValid || !isCaptchaReady}
            >
              {loading
                ? t({ it: 'Creazione account...', en: 'Creating account...' })
                : t({ it: 'Crea account', en: 'Create account' })}
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
                disabled={loading}
                onClick={handleGoogleRegister}
                label={{ it: 'Registrati con Google', en: 'Sign up with Google' }}
              />
          </>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {t({ it: 'Hai gia un account?', en: 'Already have an account?' })}{' '}
            <Link href={`/auth/login?redirect=${encodeURIComponent(redirectPath)}`} className="text-emerald-400 hover:text-emerald-300 font-medium">
              {t({ it: 'Entra', en: 'Enter' })}
            </Link>
          </div>

          <RegisterTermsNotice />
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

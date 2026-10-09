'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManaLogo } from '@/components/ui/mana-logo';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { useLanguage } from '@/components/language-provider';
import { useToast } from '@/hooks/use-toast';
import { isValidEmail } from '@/lib/auth-validation';
import { AuthPageShell } from '@/components/legal/auth-page-shell';

function ResendConfirmationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { copy: t, language } = useLanguage();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [captchaAvailable, setCaptchaAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const isCaptchaReady = Boolean(turnstileSiteKey && captchaToken && captchaAvailable);
  const isEmailValid = isValidEmail(email);

  const resetCaptcha = () => {
    setCaptchaToken('');
    setCaptchaResetSignal((signal) => signal + 1);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isEmailValid) {
      return;
    }
    if (!isCaptchaReady) {
      toast({ title: t({ it: 'Verifica richiesta', en: 'Verification required' }), description: t({ it: 'Completa la verifica anti-bot per continuare.', en: 'Complete the bot check to continue.' }) });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          captchaToken,
          locale: language,
        }),
      });

      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || t({ it: 'Invio non riuscito', en: 'Send failed' }));
      }

      router.push(`/auth/check-email?email=${encodeURIComponent(email.trim())}`);
    } catch (error: unknown) {
      resetCaptcha();
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({ it: 'Invio non riuscito', en: 'Send failed' }),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
                {t({ it: 'Reinvia conferma email', en: 'Resend confirmation email' })}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t({
                  it: 'Se non hai ancora confermato l\'account, possiamo inviarti un nuovo link.',
                  en: 'If you have not confirmed your account yet, we can send you a new link.',
                })}
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="border-border bg-background/50 text-foreground placeholder:text-muted-foreground"
              />
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
                it: 'Captcha non configurato o non disponibile.',
                en: 'Captcha is not configured or unavailable.',
              })}
            />
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800"
              disabled={loading || !isEmailValid}
            >
              {loading
                ? t({ it: 'Invio in corso...', en: 'Sending...' })
                : t({ it: 'Reinvia conferma', en: 'Resend confirmation' })}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/auth/login" className="font-medium text-emerald-400 hover:text-emerald-300">
              {t({ it: 'Torna al login', en: 'Back to login' })}
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}

export default function ResendConfirmationPage() {
  return (
    <Suspense fallback={null}>
      <ResendConfirmationForm />
    </Suspense>
  );
}

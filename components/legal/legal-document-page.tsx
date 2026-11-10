'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ManaLogo } from '@/components/ui/mana-logo';
import { useLanguage } from '@/components/language-provider';
import { legalDocumentLinks, type LegalDocument } from '@/lib/legal-documents';
import { PublicLegalFooter } from '@/components/legal/public-legal-footer';
import { getLegalContactEmail, LEGAL_LAST_UPDATED } from '@/lib/legal-site';

interface LegalDocumentPageProps {
  document: LegalDocument;
}

export function LegalDocumentPage({ document }: LegalDocumentPageProps) {
  const { copy: t, language } = useLanguage();
  const contactEmail = getLegalContactEmail();

  return (
    <div className="web-page flex min-h-screen flex-col bg-background">
      <header className="web-header safe-top sticky top-0 z-10 border-b border-border/50 bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
              <Button asChild variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
                <Link href="/auth/login" aria-label={t({ it: 'Torna al login', en: 'Back to login' })}>
                <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
            <ManaLogo size="sm" showText className="hidden sm:flex" />
          </div>
          <p className="text-xs text-muted-foreground">
            {t({ it: 'Aggiornato', en: 'Updated' })} {LEGAL_LAST_UPDATED}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-6 sm:px-4 sm:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{document.title[language]}</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{document.description[language]}</p>
        </div>

        <Card className="border-border/70 bg-card/70 backdrop-blur">
          <CardContent className="space-y-8 p-5 sm:p-8">
            {document.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-lg font-semibold text-foreground">{section.title[language]}</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                  {section.paragraphs.map((paragraph, index) => (
                    <p key={`${section.id}-${index}`}>{paragraph[language]}</p>
                  ))}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            {t({ it: 'Consulta anche: ', en: 'See also: ' })}
            {legalDocumentLinks
              .filter((entry) => entry.slug !== document.slug)
              .map((entry, index, list) => (
                <span key={entry.slug}>
                  <Link href={entry.href} className="font-medium text-emerald-400 hover:text-emerald-300">
                    {entry.label[language]}
                  </Link>
                  {index < list.length - 1 ? ', ' : ''}
                </span>
              ))}
          </p>
          {contactEmail ? (
            <a href={`mailto:${contactEmail}`} className="font-medium text-emerald-400 hover:text-emerald-300">
              {contactEmail}
            </a>
          ) : null}
        </div>
      </main>
      <PublicLegalFooter />
    </div>
  );
}

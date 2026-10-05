import { NextResponse } from 'next/server';
import { getRequestRemoteIp } from '@/lib/turnstile-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  failClosed?: boolean;
}

export const API_RATE_LIMITS = {
  deckImport: { maxRequests: 200, windowSeconds: 10 * 60 },
  archidektUserDecks: { maxRequests: 10, windowSeconds: 60 * 60 },
  arenaArchidektSync: { maxRequests: 30, windowSeconds: 60 * 60, failClosed: true },
  arenaArchidektSyncTarget: { maxRequests: 10, windowSeconds: 10 * 60, failClosed: true },
  scryfall: { maxRequests: 120, windowSeconds: 10 * 60 },
  edhrec: { maxRequests: 200, windowSeconds: 10 * 60 },
  profileDeckRefresh: { maxRequests: 200, windowSeconds: 10 * 60 },
  authRegister: { maxRequests: 5, windowSeconds: 60 * 60, failClosed: true },
  authForgotPassword: { maxRequests: 3, windowSeconds: 60 * 60, failClosed: true },
  authResendConfirmation: { maxRequests: 5, windowSeconds: 60 * 60, failClosed: true },
  authDemoLogin: { maxRequests: 20, windowSeconds: 60 * 60, failClosed: true },
  authLogin: { maxRequests: 30, windowSeconds: 60 * 60, failClosed: true },
  accountDelete: { maxRequests: 3, windowSeconds: 60 * 60, failClosed: true },
  accountExport: { maxRequests: 3, windowSeconds: 60 * 60, failClosed: true },
  accessLog: { maxRequests: 120, windowSeconds: 60 * 60 },
  inviteQr: { maxRequests: 60, windowSeconds: 10 * 60 },
  publicArena: { maxRequests: 120, windowSeconds: 10 * 60, failClosed: true },
  publicCommanderSearch: { maxRequests: 60, windowSeconds: 10 * 60 },
  arenaInvitation: { maxRequests: 60, windowSeconds: 60 * 60 },
  arenaMembership: { maxRequests: 20, windowSeconds: 60 * 60 },
  pushToken: { maxRequests: 30, windowSeconds: 60 * 60 },
  matchCompleted: { maxRequests: 120, windowSeconds: 10 * 60 },
  notifications: { maxRequests: 120, windowSeconds: 10 * 60 },
  guestClaimPreview: { maxRequests: 60, windowSeconds: 10 * 60 },
  guestClaimCreate: { maxRequests: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitConfig>;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function parseRateLimitResult(value: unknown): RateLimitResult {
  if (!value || typeof value !== 'object') {
    return { allowed: true, remaining: 0, retryAfterSeconds: 0 };
  }

  const record = value as Record<string, unknown>;
  return {
    allowed: record.allowed !== false,
    remaining: typeof record.remaining === 'number' ? record.remaining : 0,
    retryAfterSeconds: typeof record.retry_after_seconds === 'number'
      ? record.retry_after_seconds
      : 0,
  };
}

export async function consumeRateLimit(bucketKey: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    if (config.failClosed) {
      return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
    }
    return { allowed: true, remaining: config.maxRequests, retryAfterSeconds: 0 };
  }

  try {
    const { data, error } = await adminClient.rpc('check_api_rate_limit', {
      p_bucket_key: bucketKey,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });

    if (error) {
      console.error('Rate limit RPC failed:', error.message);
      if (config.failClosed) {
        return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
      }
      return { allowed: true, remaining: config.maxRequests, retryAfterSeconds: 0 };
    }

    return parseRateLimitResult(data);
  } catch (error) {
    console.error('Rate limit check failed:', error);
    if (config.failClosed) {
      return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
    }
    return { allowed: true, remaining: config.maxRequests, retryAfterSeconds: 0 };
  }
}

export function buildUserRateLimitKey(scope: string, userId: string) {
  return `${scope}:user:${userId}`;
}

export function buildIpRateLimitKey(scope: string, request: Request) {
  const remoteIp = getRequestRemoteIp(request) || 'unknown';
  return `${scope}:ip:${remoteIp}`;
}

export function createRateLimitResponse(retryAfterSeconds: number) {
  const headers = retryAfterSeconds > 0
    ? { 'Retry-After': String(retryAfterSeconds) }
    : undefined;

  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers },
  );
}

export async function enforceUserRateLimit(
  userId: string,
  scope: keyof typeof API_RATE_LIMITS,
) {
  const config = API_RATE_LIMITS[scope];
  const result = await consumeRateLimit(buildUserRateLimitKey(scope, userId), config);

  if (!result.allowed) {
    return createRateLimitResponse(result.retryAfterSeconds);
  }

  return null;
}

export async function enforceIpRateLimit(
  request: Request,
  scope: keyof typeof API_RATE_LIMITS,
) {
  const config = API_RATE_LIMITS[scope];
  const result = await consumeRateLimit(buildIpRateLimitKey(scope, request), config);

  if (!result.allowed) {
    return createRateLimitResponse(result.retryAfterSeconds);
  }

  return null;
}

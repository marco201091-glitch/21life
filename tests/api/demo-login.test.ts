import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyIpRateLimit: vi.fn(),
  demoSignIn: vi.fn(),
  adminSignIn: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@/app/api/_lib/with-rate-limit', () => ({ applyIpRateLimit: mocks.applyIpRateLimit }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminClient: () => ({ auth: { signInWithPassword: mocks.adminSignIn } }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import { POST } from '@/app/api/auth/demo-login/route';

describe('demo login preserves privileged server clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_MODE_ENABLED = 'true';
    process.env.DEMO_USER_EMAIL = 'demo@example.com';
    process.env.DEMO_USER_PASSWORD = 'demo-password';
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'public-anon-key';
    mocks.applyIpRateLimit.mockResolvedValue(null);
    const result = { data: { user: { app_metadata: { is_demo: true } }, session: { access_token: 'demo-access', refresh_token: 'demo-refresh', expires_at: 1000 } }, error: null };
    mocks.demoSignIn.mockResolvedValue(result);
    mocks.adminSignIn.mockResolvedValue(result);
    mocks.createClient.mockImplementation(() => ({ auth: { signInWithPassword: mocks.demoSignIn } }));
  });
  it('authenticates every demo request with an isolated public client', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await POST(new Request('https://app.example.com/api/auth/demo-login', { method: 'POST' }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ access_token: 'demo-access', refresh_token: 'demo-refresh', expires_at: 1000 });
    }
    expect(mocks.adminSignIn).not.toHaveBeenCalled();
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).toHaveBeenCalledWith('https://project.supabase.co', 'public-anon-key', {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  });
  it('refuses sessions that do not belong to the configured demo account', async () => {
    mocks.demoSignIn.mockResolvedValue({ data: { user: { app_metadata: {} }, session: { access_token: 'other-token' } }, error: null });
    const response = await POST(new Request('https://app.example.com/api/auth/demo-login', { method: 'POST' }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('other-token');
  });
  it('does not create a session when demo login is disabled or rate limited', async () => {
    process.env.DEMO_MODE_ENABLED = 'false';
    expect((await POST(new Request('https://app.example.com/api/auth/demo-login', { method: 'POST' }))).status).toBe(404);
    process.env.DEMO_MODE_ENABLED = 'true';
    mocks.applyIpRateLimit.mockResolvedValue(new Response('blocked', { status: 429 }));
    expect((await POST(new Request('https://app.example.com/api/auth/demo-login', { method: 'POST' }))).status).toBe(429);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.adminSignIn).not.toHaveBeenCalled();
  });
});

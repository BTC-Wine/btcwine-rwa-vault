import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

process.env.MERCURY_JWT ??= 'unused';
process.env.DELIVERY_KEY ??= randomBytes(32).toString('hex');
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.SUMSUB_APP_TOKEN = 'sbx:session-test-token';
process.env.SUMSUB_APP_SECRET = 'sumsub-test-secret';

const { sumsubSignature } = await import('./session.js');
const { buildServer } = await import('../api/server.js');

const WALLET = 'G' + 'TEST'.repeat(13) + 'TES';

describe('sumsubSignature', () => {
  it('matches a vector computed independently with openssl', () => {
    // printf '%s' '1700000000POST/resources/accessTokens/sdk{"userId":"G...",
    // "levelName":"id-and-liveness","ttlInSecs":600}' \
    //   | openssl dgst -sha256 -hmac 'sumsub-test-secret'
    const body = JSON.stringify({ userId: WALLET, levelName: 'id-and-liveness', ttlInSecs: 600 });
    const sig = sumsubSignature(
      'sumsub-test-secret',
      1700000000,
      'POST',
      '/resources/accessTokens/sdk',
      body,
    );
    expect(sig).toBe('1201ab84be201ffde9cbfa044166125fe1a824a54af560eec157607141f2d305');
  });
});

describe('POST /kyc/session', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    token = app.jwt.sign({ sub: WALLET });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  afterEach(() => fetchMock.mockReset());

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'POST', url: '/kyc/session' });
    expect(res.statusCode).toBe(401);
  });

  it('returns a WebSDK token signed for the authenticated wallet', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'sdk-access-token', userId: WALLET }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/kyc/session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ token: 'sdk-access-token', level: 'id-and-liveness' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sumsub.com/resources/accessTokens/sdk');
    expect(JSON.parse(init.body)).toEqual({
      userId: WALLET,
      levelName: 'id-and-liveness',
      ttlInSecs: 600,
    });
    expect(init.headers['X-App-Token']).toBe('sbx:session-test-token');
    const ts = Number(init.headers['X-App-Access-Ts']);
    expect(ts).toBeGreaterThan(1700000000);
    expect(init.headers['X-App-Access-Sig']).toBe(
      sumsubSignature('sumsub-test-secret', ts, 'POST', '/resources/accessTokens/sdk', init.body),
    );
  });

  it('answers 502 when Sumsub rejects the request', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const res = await app.inject({
      method: 'POST',
      url: '/kyc/session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'verification provider error' });
  });

  it('answers 503 while the app token pair is not configured', async () => {
    const savedToken = process.env.SUMSUB_APP_TOKEN;
    const savedSecret = process.env.SUMSUB_APP_SECRET;
    delete process.env.SUMSUB_APP_TOKEN;
    delete process.env.SUMSUB_APP_SECRET;
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/kyc/session',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: 'verification unavailable' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.env.SUMSUB_APP_TOKEN = savedToken;
      process.env.SUMSUB_APP_SECRET = savedSecret;
    }
  });
});

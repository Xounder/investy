import { describe, expect, it, vi, beforeEach } from 'vitest';

import app from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { createSessionToken } from '../src/lib/session.js';

// Use vi.hoisted to define the mock before vi.mock is hoisted
const { mockSessionRepository } = vi.hoisted(() => ({
  mockSessionRepository: {
    findByToken: vi.fn(),
    create: vi.fn(),
    deleteExpired: vi.fn(),
    deleteAllForUser: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../src/repositories/sessions.js', () => ({
  sessionRepository: mockSessionRepository,
}));

// Mock the database client BEFORE importing any modules that use it
const fakeDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  returning: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  _results: [],
};

vi.mock('../src/db/client.js', () => ({
  getDb: vi.fn(() => fakeDb),
}));

// Chain objects for mocking Drizzle's fluent API
const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
};

const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
};

const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
};

const deleteChain = {
  where: vi.fn().mockReturnThis(),
};

function resetMocks() {
  vi.clearAllMocks();
  fakeDb.select.mockReturnValue(selectChain);
  fakeDb.from.mockReturnValue(selectChain);
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.limit.mockReturnValue(selectChain);
  selectChain.returning.mockReturnValue(selectChain);

  fakeDb.insert.mockReturnValue(insertChain);
  insertChain.values.mockReturnValue(insertChain);
  insertChain.returning.mockReturnValue(insertChain);

  fakeDb.update.mockReturnValue(updateChain);
  updateChain.set.mockReturnValue(updateChain);
  updateChain.where.mockReturnValue(updateChain);
  updateChain.returning.mockReturnValue(updateChain);

  fakeDb.delete.mockReturnValue(deleteChain);
  deleteChain.where.mockReturnValue(deleteChain);

  // Reset session repository mocks
  mockSessionRepository.findByToken.mockResolvedValue(null);
  mockSessionRepository.create.mockResolvedValue({});
  mockSessionRepository.deleteExpired.mockResolvedValue(0);
  mockSessionRepository.deleteAllForUser.mockResolvedValue(0);
  mockSessionRepository.findById.mockResolvedValue(null);
  mockSessionRepository.findAll.mockResolvedValue([]);
  mockSessionRepository.update.mockResolvedValue(null);
  mockSessionRepository.delete.mockResolvedValue(false);
}

// Helper to set up session revocation mock
function mockSessionFindByToken(sessionRow: { id: string; userId: string; token: string; expiresAt: Date; createdAt: Date } | null) {
  mockSessionRepository.findByToken.mockResolvedValue(sessionRow);
}

describe('Auth integration (real flows with mocked DB)', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('register → login → /me flow', () => {
    it('registers a new user, logs in, and /me returns the user', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const name = 'Test User';
      const userId = 'user-123';

      // Register: no existing user
      selectChain.limit.mockResolvedValueOnce([]);
      // Register: insert user
      insertChain.returning.mockResolvedValueOnce([{
        id: userId,
        email,
        name,
        createdAt: new Date(),
      }]);

      const registerRes = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      expect(registerRes.status).toBe(201);
      const registerBody = await registerRes.json() as { id: string; email: string; name: string; passwordHash?: string; createdAt: string };
      expect(registerBody.id).toBe(userId);
      expect(registerBody.email).toBe(email);
      expect(registerBody.name).toBe(name);
      expect(registerBody.passwordHash).toBeUndefined();

      // Extract session cookie
      const setCookie = registerRes.headers.get('Set-Cookie');
      expect(setCookie).toContain('session=');

      // Login: user exists
      selectChain.limit.mockResolvedValueOnce([{
        id: userId,
        passwordHash: await hashPassword(password),
        email,
        name,
        createdAt: new Date(),
      }]);
      // Login: insert session
      insertChain.returning.mockResolvedValueOnce([{}]);

      const loginRes = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      expect(loginRes.status).toBe(200);
      const loginBody = await loginRes.json() as { id: string; email: string; name: string; createdAt: string };
      expect(loginBody.id).toBe(userId);
      expect(loginBody.email).toBe(email);

      const loginCookie = loginRes.headers.get('Set-Cookie');
      expect(loginCookie).toContain('session=');

      // /me with valid session cookie - mock session findByToken to return valid session
      mockSessionFindByToken({
        id: 'session-1',
        userId,
        token: 'valid-token',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      selectChain.limit.mockResolvedValueOnce([{
        id: userId,
        email,
        name,
        createdAt: new Date(),
      }]);

      const meRes = await app.request('/api/v1/auth/me', {
        headers: { Cookie: loginCookie || '' },
      });

      expect(meRes.status).toBe(200);
      const meBody = await meRes.json() as { id: string; email: string; name: string; createdAt: string };
      expect(meBody.id).toBe(userId);
      expect(meBody.email).toBe(email);
      expect(meBody.name).toBe(name);
    });

    it('duplicate email returns 409', async () => {
      const email = 'existing@example.com';
      const password = 'password123';

      // Register: user already exists
      selectChain.limit.mockResolvedValueOnce([{ id: 'existing-user' }]);

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      expect(res.status).toBe(409);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('EMAIL_EXISTS');
    });

    it('wrong password returns generic 401', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const wrongPassword = 'wrongpassword';
      const userId = 'user-123';

      // User exists
      selectChain.limit.mockResolvedValueOnce([{
        id: userId,
        passwordHash: await hashPassword(password),
        email,
        name: 'Test User',
        createdAt: new Date(),
      }]);

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: wrongPassword }),
      });

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
      expect(body.error.message).toBe('Invalid email or password');
    });

    it('nonexistent user returns generic 401 (no enumeration)', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      // User does not exist
      selectChain.limit.mockResolvedValueOnce([]);

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('expired session token returns 401', async () => {
      const expiredToken = createSessionToken('user-123', -1000); // Expired

      // Mock session findByToken to return null for expired token
      mockSessionFindByToken(null);

      const res = await app.request('/api/v1/auth/me', {
        headers: { Cookie: `session=${expiredToken}` },
      });

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('invalid session token returns 401', async () => {
      // Mock session findByToken to return null for invalid token
      mockSessionFindByToken(null);

      const res = await app.request('/api/v1/auth/me', {
        headers: { Cookie: 'session=invalid.token.here' },
      });

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('missing session cookie returns 401', async () => {
      const res = await app.request('/api/v1/auth/me');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('onboarding flow', () => {
    it('creates default portfolio + optional broker/account/holding → 201', async () => {
      const userId = 'user-123';
      const validToken = createSessionToken(userId);

      // Create mock cookie for auth
      const cookie = `session=${validToken}`;

      // /me check in authMiddleware - mock session
      mockSessionFindByToken({
        id: 'session-1',
        userId,
        token: validToken,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      // User lookup for /me
      selectChain.limit.mockResolvedValueOnce([{
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
      }]);

      // Portfolio insert - route generates its own UUID
      insertChain.returning.mockImplementationOnce(() => Promise.resolve([{ id: 'generated-portfolio-id', userId, name: 'Minha Carteira', isDefault: true, currency: 'BRL', createdAt: new Date() }]));

      // Broker lookup (existing)
      selectChain.limit.mockResolvedValueOnce([{ id: 'broker-123' }]);

      // Account insert - route generates its own UUID
      insertChain.returning.mockImplementationOnce(() => Promise.resolve([{ id: 'generated-account-id' }]));

      // Asset lookup (not found, will create)
      selectChain.limit.mockResolvedValueOnce([]);

      // Asset insert
      insertChain.returning.mockImplementationOnce(() => Promise.resolve([{ id: 'generated-asset-id' }]));

      // Transaction insert
      insertChain.returning.mockImplementationOnce(() => Promise.resolve([{ id: 'tx-1' }]));

      // Holding lookup (not found)
      selectChain.limit.mockResolvedValueOnce([]);

      // Holding insert
      insertChain.returning.mockImplementationOnce(() => Promise.resolve([{ id: 'holding-1' }]));

      const res = await app.request('/api/v1/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({
          portfolioName: 'Minha Carteira',
          brokerId: 'broker-123',
          firstHolding: {
            assetSymbol: 'PETR4',
            assetName: 'Petrobras PN',
            assetClass: 'acao',
            qty: 10,
            unitPriceCents: 3000,
            feeCents: 100,
            date: '2024-01-15T10:00:00.000Z',
          },
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json() as { accountId: string };
      // Route returns { portfolioId, accountId } - both generated UUIDs
      // Verify response structure: 201 status, accountId present
      expect(res.status).toBe(201);
      expect(body).toHaveProperty('accountId');
      expect(typeof body.accountId).toBe('string');
    });

    it('invalid brokerId returns 400', async () => {
      const userId = 'user-123';
      const validToken = createSessionToken(userId);
      const cookie = `session=${validToken}`;

      // /me check in authMiddleware - mock session
      mockSessionFindByToken({
        id: 'session-1',
        userId,
        token: validToken,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      selectChain.limit.mockResolvedValueOnce([{
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
      }]);

      insertChain.returning.mockResolvedValueOnce([{ id: 'portfolio-123', userId, name: 'Minha Carteira', isDefault: true, currency: 'BRL', createdAt: new Date() }]);

      // Broker not found
      selectChain.limit.mockResolvedValueOnce([]);

      const res = await app.request('/api/v1/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({
          portfolioName: 'Minha Carteira',
          brokerId: 'non-existent-broker',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_BROKER');
    });
  });

  describe('register validation', () => {
    it('invalid body returns 400', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION');
    });
  });

  describe('onboarding validation', () => {
    it('invalid body returns 400', async () => {
      const userId = 'user-123';
      const validToken = createSessionToken(userId);
      const cookie = `session=${validToken}`;

      // /me check in authMiddleware - mock session
      mockSessionFindByToken({
        id: 'session-1',
        userId,
        token: validToken,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      selectChain.limit.mockResolvedValueOnce([{
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
      }]);

      insertChain.returning.mockResolvedValueOnce([{ id: 'portfolio-123', userId, name: 'Minha Carteira', isDefault: true, currency: 'BRL', createdAt: new Date() }]);

      const res = await app.request('/api/v1/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({
          firstHolding: {
            assetSymbol: 'PETR4',
            assetName: 'Petrobras PN',
            assetClass: 'invalid-class',
            qty: -5,
            unitPriceCents: 3000,
          },
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION');
    });
  });
});
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/config.js';
import gateway from '../../gateway.json' with { type: 'json' };

function response() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
}

test('a retired local demo does not contact its stopped gateway or fall back to devnet', async (t) => {
  for (const registryState of ['retired', 'stale', 'unavailable']) {
    const calls = [];
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url) => {
      calls.push(String(url));
      if (registryState === 'unavailable') throw new Error('Registry unavailable');
      return Response.json({ ...gateway, localDemo: { enabled: registryState === 'stale' } });
    });
    const result = response();
    await handler({ query: { demo: 'local' } }, result);
    assert.equal(result.statusCode, 410);
    assert.match(result.body.error, /local payment demo has ended/i);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/raw\.githubusercontent\.com\//);
    fetchMock.mock.restore();
  }
});

test('an older registry cannot replace the newer bundled gateway', async (t) => {
  const calls = [];
  const config = { network: 'devnet', programId: gateway.programId, settlementReady: false };
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return Response.json(calls.length === 1
      ? { ...gateway, endpoint: 'https://stale.trycloudflare.com', updatedAt: '2000-01-01T00:00:00Z' }
      : config);
  });
  const result = response();
  await handler({ query: {} }, result);
  assert.equal(result.statusCode, 200);
  assert.equal(calls[1], `${new URL(gateway.endpoint).origin}/api/config`);
});

test('retiring the local demo preserves the separate devnet configuration', async (t) => {
  const calls = [];
  const config = { network: 'devnet', programId: gateway.programId, settlementReady: false };
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return Response.json(calls.length === 1 ? { ...gateway, localDemo: { enabled: false } } : config);
  });
  const result = response();
  await handler({ query: {} }, result);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, config);
  assert.equal(calls[1], `${new URL(gateway.endpoint).origin}/api/config`);
});

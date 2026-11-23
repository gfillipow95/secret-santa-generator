import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../lib/app.js';

let server;
let base;
let dir;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'santa-wishlist-'));
  server = createApp({ dataFile: join(dir, 'db.json') }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

async function exchange() {
  const setup = { name: 'Wishes', participants: ['Ana', 'Ben', 'Cy'].map((name) => ({ name })) };
  const { adminToken } = (await call('/api/groups', 'POST', setup)).body;
  const admin = (await call(`/api/admin/${adminToken}`)).body;
  const tokenOf = Object.fromEntries(admin.participants.map((p) => [p.name, p.token]));
  return { adminToken, tokenOf };
}

test('people save a wishlist that only their Santa sees, after unwrapping', async () => {
  const { adminToken, tokenOf } = await exchange();
  const saved = await call(`/api/santa/${tokenOf.Ana}/wishlist`, 'PUT', { wishlist: '  Wool socks\nDark chocolate  ' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.me.wishlist, 'Wool socks\nDark chocolate', 'people see their own wishlist, trimmed');

  const admin = (await call(`/api/admin/${adminToken}`)).body;
  assert.deepEqual(admin.participants.map((p) => [p.name, p.hasWishlist]), [['Ana', true], ['Ben', false], ['Cy', false]]);
  assert.ok(!JSON.stringify(admin).includes('Wool socks'), 'the organizer sees who has one, not what it says');

  await call(`/api/admin/${adminToken}/draw`, 'POST');
  for (const name of ['Ben', 'Cy']) {
    assert.equal((await call(`/api/santa/${tokenOf[name]}`)).body.recipient, null);
    const { recipient } = (await call(`/api/santa/${tokenOf[name]}/reveal`, 'POST')).body;
    assert.equal(recipient.wishlist, recipient.name === 'Ana' ? 'Wool socks\nDark chocolate' : '');
  }
});

test('a wishlist can change after the draw and survives a reset', async () => {
  const { adminToken, tokenOf } = await exchange();
  await call(`/api/admin/${adminToken}/draw`, 'POST');
  await call(`/api/santa/${tokenOf.Ben}/wishlist`, 'PUT', { wishlist: 'Board games' });
  await call(`/api/admin/${adminToken}/reset`, 'POST');
  assert.equal((await call(`/api/santa/${tokenOf.Ben}`)).body.me.wishlist, 'Board games');
});

test('wishlists must be text of 1000 characters or fewer', async () => {
  const { tokenOf } = await exchange();
  assert.equal((await call(`/api/santa/${tokenOf.Cy}/wishlist`, 'PUT', { wishlist: 'x'.repeat(1001) })).status, 400);
  assert.equal((await call(`/api/santa/${tokenOf.Cy}/wishlist`, 'PUT', { wishlist: 42 })).status, 400);
  assert.equal((await call('/api/santa/nope/wishlist', 'PUT', { wishlist: 'hi' })).status, 404);
});

test('hard nos are saved alongside the wishlist and shown the same way', async () => {
  const { adminToken, tokenOf } = await exchange();
  const saved = (await call(`/api/santa/${tokenOf.Ana}/wishlist`, 'PUT', { wishlist: '', hardNos: ' No candles\nPeanut allergy ' })).body;
  assert.equal(saved.me.hardNos, 'No candles\nPeanut allergy');
  assert.equal(saved.me.wishlist, '');

  const admin = (await call(`/api/admin/${adminToken}`)).body;
  assert.equal(admin.participants.find((p) => p.name === 'Ana').hasWishlist, true, 'hard nos alone count as a list');
  assert.ok(!JSON.stringify(admin).includes('candles'));

  await call(`/api/admin/${adminToken}/draw`, 'POST');
  for (const name of ['Ben', 'Cy']) {
    assert.equal((await call(`/api/santa/${tokenOf[name]}`)).body.recipient, null);
    const { recipient } = (await call(`/api/santa/${tokenOf[name]}/reveal`, 'POST')).body;
    assert.equal(recipient.hardNos, recipient.name === 'Ana' ? 'No candles\nPeanut allergy' : '');
  }
  assert.equal((await call(`/api/santa/${tokenOf.Ana}/wishlist`, 'PUT', { wishlist: 'Socks', hardNos: 'x'.repeat(1001) })).status, 400);
});

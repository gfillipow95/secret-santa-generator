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
  dir = mkdtempSync(join(tmpdir(), 'santa-test-'));
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

const setup = {
  name: 'Family Swap',
  budget: '$30',
  date: '2026-12-24',
  note: 'Bring cocoa',
  participants: ['Ana', 'Ben', 'Cy', 'Di', 'Eve'].map((name) => ({ name })),
  couples: [['Ana', 'Ben'], ['Cy', 'Di']],
};

test('full exchange: create, draw, reveal, with secrets kept', async () => {
  const created = await call('/api/groups', 'POST', setup);
  assert.equal(created.status, 201);
  const { adminToken } = created.body;

  const admin = (await call(`/api/admin/${adminToken}`)).body;
  assert.equal(admin.drawn, false);
  assert.deepEqual(admin.couples, [['Ana', 'Ben'], ['Cy', 'Di']]);
  const tokenOf = Object.fromEntries(admin.participants.map((p) => [p.name, p.token]));

  const early = await call(`/api/santa/${tokenOf.Ben}/reveal`, 'POST');
  assert.equal(early.status, 409, 'cannot reveal before the draw');

  const drawn = await call(`/api/admin/${adminToken}/draw`, 'POST');
  assert.equal(drawn.status, 200);
  assert.ok(!JSON.stringify(drawn.body).includes('recipient'), 'organizer view has no pairings');
  assert.equal((await call(`/api/admin/${adminToken}/draw`, 'POST')).status, 409, 'cannot draw twice');

  const partnerOf = { Ana: 'Ben', Ben: 'Ana', Cy: 'Di', Di: 'Cy' };
  const received = [];
  for (const [name, token] of Object.entries(tokenOf)) {
    const unopened = (await call(`/api/santa/${token}`)).body;
    assert.equal(unopened.drawn, true);
    assert.equal(unopened.recipient, null, 'the match stays hidden until the gift is opened');
    const view = (await call(`/api/santa/${token}/reveal`, 'POST')).body;
    assert.equal(view.me.name, name);
    assert.notEqual(view.recipient.name, name);
    assert.notEqual(view.recipient.name, partnerOf[name], `${name} drew their partner`);
    assert.ok(!JSON.stringify(view).includes('token'), 'participant view leaks no tokens');
    received.push(view.recipient.name);
  }
  assert.deepEqual(received.sort(), Object.keys(tokenOf).sort(), 'everyone is someone’s match');

  const eveAgain = (await call(`/api/santa/${tokenOf.Eve}`)).body;
  assert.notEqual(eveAgain.recipient, null, 'an opened match stays visible');
  const progress = (await call(`/api/admin/${adminToken}`)).body;
  assert.equal(progress.participants.find((p) => p.name === 'Eve').revealed, true);
});

test('roster is locked after the draw until reset, and links survive edits', async () => {
  const { adminToken } = (await call('/api/groups', 'POST', setup)).body;
  const before = (await call(`/api/admin/${adminToken}`)).body;
  await call(`/api/admin/${adminToken}/draw`, 'POST');

  const blocked = await call(`/api/admin/${adminToken}`, 'PUT', { ...setup, participants: before.participants });
  assert.equal(blocked.status, 409);

  const settingsOnly = await call(`/api/admin/${adminToken}`, 'PUT', { name: 'Renamed', budget: '$40' });
  assert.equal(settingsOnly.body.name, 'Renamed');
  assert.equal(settingsOnly.body.drawn, true);

  await call(`/api/admin/${adminToken}/reset`, 'POST');
  const kept = before.participants.filter((p) => p.name !== 'Eve');
  const edited = await call(`/api/admin/${adminToken}`, 'PUT', {
    ...setup,
    participants: [...kept, { name: 'Fay' }],
  });
  assert.equal(edited.status, 200);
  const tokens = Object.fromEntries(edited.body.participants.map((p) => [p.name, p.token]));
  assert.equal(tokens.Ana, before.participants.find((p) => p.name === 'Ana').token, 'existing links still work');
  assert.ok(tokens.Fay && !tokens.Eve);
  assert.equal((await call(`/api/santa/${before.participants.find((p) => p.name === 'Eve').token}`)).status, 404);
});

test('rejects setups that cannot work', async () => {
  const cases = [
    [{ ...setup, participants: [{ name: 'Ana' }, { name: 'Ben' }], couples: [] }, /at least 3/],
    [{ ...setup, participants: [{ name: 'Ana' }, { name: 'ana' }, { name: 'Cy' }], couples: [] }, /twice/],
    [{ ...setup, participants: [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cy' }], couples: [['Ana', 'Ben']] }, /no way to draw/],
    [{ ...setup, couples: [['Ana', 'Ben'], ['Ben', 'Cy']] }, /more than one couple/],
    [{ ...setup, couples: [['Ana', 'Zed']] }, /not on the list/],
    [{ ...setup, name: '  ' }, /required/],
    [{ ...setup, date: 'Christmas' }, /Exchange date/],
    [{ ...setup, date: '2026-02-31' }, /Exchange date/],
    [{ ...setup, date: '2026-13-01' }, /Exchange date/],
  ];
  for (const [body, message] of cases) {
    const result = await call('/api/groups', 'POST', body);
    assert.equal(result.status, 400);
    assert.match(result.body.error, message);
  }
});

test('someone removed and added back in the same edit keeps their link', async () => {
  const { adminToken } = (await call('/api/groups', 'POST', setup)).body;
  const before = (await call(`/api/admin/${adminToken}`)).body;
  const withoutEve = before.participants.filter((p) => p.name !== 'Eve');
  const back = (await call(`/api/admin/${adminToken}`, 'PUT', { ...setup, participants: [...withoutEve, { name: 'eve' }] })).body;
  const eve = back.participants.find((p) => p.name === 'eve');
  assert.equal(eve.token, before.participants.find((p) => p.name === 'Eve').token);
  assert.equal((await call(`/api/santa/${eve.token}`)).body.me.name, 'eve');
});

test('one person cannot appear twice under different names', async () => {
  const { adminToken } = (await call('/api/groups', 'POST', setup)).body;
  const [ana, ...rest] = (await call(`/api/admin/${adminToken}`)).body.participants;
  const result = await call(`/api/admin/${adminToken}`, 'PUT', {
    ...setup,
    participants: [ana, { id: ana.id, name: 'Zed' }, ...rest],
    couples: [],
  });
  assert.equal(result.status, 400);
  assert.equal((await call(`/api/admin/${adminToken}`)).body.participants.length, 5, 'roster unchanged');
});

test('unknown links get a friendly 404', async () => {
  assert.equal((await call('/api/santa/nope')).status, 404);
  assert.equal((await call('/api/admin/nope')).status, 404);
});

test('data survives a restart', async () => {
  const { adminToken } = (await call('/api/groups', 'POST', setup)).body;
  const restarted = createApp({ dataFile: join(dir, 'db.json') }).listen(0);
  await new Promise((resolve) => restarted.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/admin/${adminToken}`);
  restarted.close();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).name, 'Family Swap');
});

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../lib/app.js';

const dirs = [];
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

async function start(options) {
  const dir = mkdtempSync(join(tmpdir(), 'santa-passcode-'));
  dirs.push(dir);
  const server = createApp({ dataFile: join(dir, 'db.json'), ...options }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  };
  return { call, close: () => server.close() };
}

const setup = { name: 'Swap', participants: [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cy' }] };

test('creating an exchange needs the passcode when one is set', async () => {
  const { call, close } = await start({ createPasscode: 'jingle bells' });
  try {
    assert.deepEqual((await call('/api/config')).body, { passcodeRequired: true });
    assert.equal((await call('/api/groups', 'POST', setup)).status, 401);
    assert.equal((await call('/api/groups', 'POST', { ...setup, passcode: 'jingle' })).status, 401);
    const created = await call('/api/groups', 'POST', { ...setup, passcode: 'jingle bells' });
    assert.equal(created.status, 201);
    assert.equal((await call(`/api/admin/${created.body.adminToken}`)).status, 200, 'organizer links need no passcode');
  } finally {
    close();
  }
});

test('no passcode is needed when none is set', async () => {
  const { call, close } = await start({});
  try {
    assert.deepEqual((await call('/api/config')).body, { passcodeRequired: false });
    assert.equal((await call('/api/groups', 'POST', setup)).status, 201);
  } finally {
    close();
  }
});

test('too many wrong passcodes pause creating for a while', async () => {
  const { call, close } = await start({ createPasscode: 'jingle bells' });
  try {
    for (let i = 0; i < 10; i++) assert.equal((await call('/api/groups', 'POST', { ...setup, passcode: `guess ${i}` })).status, 401);
    const paused = await call('/api/groups', 'POST', { ...setup, passcode: 'jingle bells' });
    assert.equal(paused.status, 429, 'even the right passcode waits once guessing starts');
  } finally {
    close();
  }
});

test('every response asks search engines not to list it', async () => {
  const { call, close } = await start({});
  try {
    for (const path of ['/', '/style.css', '/santa/abc', '/admin/abc', '/api/config', '/api/santa/nope']) {
      assert.equal((await call(path)).headers.get('x-robots-tag'), 'noindex, nofollow', path);
    }
  } finally {
    close();
  }
});

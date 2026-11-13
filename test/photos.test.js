import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../lib/app.js';

let server;
let base;
let dir;
const photosDir = () => join(dir, 'photos');
const storedPhotos = () => (existsSync(photosDir()) ? readdirSync(photosDir()) : []);

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'santa-photos-'));
  server = createApp({ dataFile: join(dir, 'db.json') }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const jpeg = (marker = 1) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, marker, 2, 3, 4, 0xff, 0xd9]);

async function call(path, method = 'GET', body, type = 'application/json') {
  const response = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': type } : undefined,
    body: body && type === 'application/json' ? JSON.stringify(body) : body,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function exchange() {
  const setup = { name: 'Photos', participants: ['Ana', 'Ben', 'Cy'].map((name) => ({ name })) };
  const { adminToken } = (await call('/api/groups', 'POST', setup)).body;
  const admin = (await call(`/api/admin/${adminToken}`)).body;
  const person = (name) => admin.participants.find((p) => p.name === name);
  return { adminToken, admin, person, photoPath: (name) => `/api/admin/${adminToken}/people/${person(name).id}/photo` };
}

test('the organizer adds a photo and everyone sees it at the right time', async () => {
  const { adminToken, person, photoPath } = await exchange();
  const uploaded = await call(photoPath('Ana'), 'PUT', jpeg(), 'image/jpeg');
  assert.equal(uploaded.status, 200);
  const anaPhoto = uploaded.body.participants.find((p) => p.name === 'Ana').photo;
  assert.match(anaPhoto, /^\/photos\/[\w-]+\.jpg$/);

  const served = await fetch(base + anaPhoto);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), jpeg());

  assert.equal((await call(`/api/santa/${person('Ana').token}`)).body.me.photo, anaPhoto, 'people see their own photo');

  await call(`/api/admin/${adminToken}/draw`, 'POST');
  for (const name of ['Ben', 'Cy']) {
    const token = person(name).token;
    assert.equal((await call(`/api/santa/${token}`)).body.recipient, null, 'match and photo stay hidden before unwrapping');
    const opened = (await call(`/api/santa/${token}/reveal`, 'POST')).body;
    assert.equal(opened.recipient.photo, opened.recipient.name === 'Ana' ? anaPhoto : null);
  }
});

test('replacing or removing a photo deletes the old file', async () => {
  const { photoPath } = await exchange();
  const before = storedPhotos().length;
  await call(photoPath('Ben'), 'PUT', jpeg(1), 'image/jpeg');
  const second = (await call(photoPath('Ben'), 'PUT', jpeg(2), 'image/jpeg')).body;
  assert.equal(storedPhotos().length, before + 1, 'the first photo was replaced, not kept');

  const benPhoto = second.participants.find((p) => p.name === 'Ben').photo;
  const removed = await call(photoPath('Ben'), 'DELETE');
  assert.equal(removed.body.participants.find((p) => p.name === 'Ben').photo, null);
  assert.equal(storedPhotos().length, before);
  assert.equal((await fetch(base + benPhoto)).status, 404);
});

test('removing someone from the exchange deletes their photo', async () => {
  const { adminToken, admin, photoPath } = await exchange();
  await call(photoPath('Cy'), 'PUT', jpeg(), 'image/jpeg');
  const before = storedPhotos().length;
  await call(`/api/admin/${adminToken}`, 'PUT', {
    name: 'Photos',
    participants: [...admin.participants.filter((p) => p.name !== 'Cy'), { name: 'Di' }],
  });
  assert.equal(storedPhotos().length, before - 1);
});

test('only small JPEG photos for real people are accepted', async () => {
  const { adminToken, photoPath } = await exchange();
  assert.equal((await call(photoPath('Ana'), 'PUT', Buffer.from('<svg/>'), 'image/jpeg')).status, 415, 'not really a JPEG');
  assert.equal((await call(photoPath('Ana'), 'PUT', Buffer.from('GIF89a'), 'image/gif')).status, 415);
  const huge = Buffer.concat([jpeg(), Buffer.alloc(400 * 1024)]);
  assert.equal((await call(photoPath('Ana'), 'PUT', huge, 'image/jpeg')).status, 413);
  assert.equal((await call(`/api/admin/${adminToken}/people/nobody/photo`, 'PUT', jpeg(), 'image/jpeg')).status, 404);
  assert.equal((await call(`/api/admin/wrong/people/x/photo`, 'PUT', jpeg(), 'image/jpeg')).status, 404);
  assert.equal((await fetch(`${base}/photos/../db.json`)).status, 404);
});

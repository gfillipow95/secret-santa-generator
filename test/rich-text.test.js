import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../lib/app.js';

const dirs = [];
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

async function start(data) {
  const dir = mkdtempSync(join(tmpdir(), 'santa-rich-'));
  dirs.push(dir);
  if (data) writeFileSync(join(dir, 'db.json'), JSON.stringify(data));
  const server = createApp({ dataFile: join(dir, 'db.json') }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  return { call, close: () => server.close() };
}

// Saved before rich text existed: plain `wishlist` and `hardNos`, and some people with neither field.
const liveShaped = {
  groups: {
    g1: {
      id: 'g1', adminToken: 'admin-1', createdAt: '2026-11-20T00:00:00.000Z', name: 'Cousins', budget: '$40', date: '', note: '', organizer: 'Jordan',
      participants: [
        { id: 'a', token: 'tok-ana', name: 'Ana', revealedAt: null, photo: null, wishlist: 'Fuzzy slippers (size 8)\n  - anything <matcha> & tea', hardNos: 'No candles' },
        { id: 'b', token: 'tok-ben', name: 'Ben', revealedAt: '2026-11-21T00:00:00.000Z' },
        { id: 'c', token: 'tok-cy', name: 'Cy', revealedAt: null },
      ],
      couples: [],
      assignments: { a: 'b', b: 'a', c: 'a' },
      drawnAt: '2026-11-20T00:00:00.000Z',
    },
  },
};

test('lists saved before rich text show exactly as before', async () => {
  const { call, close } = await start(liveShaped);
  try {
    const ana = (await call('/api/santa/tok-ana')).body.me;
    assert.equal(ana.wishlist, 'Fuzzy slippers (size 8)\n  - anything <matcha> & tea', 'plain text is unchanged');
    assert.equal(ana.wishlistHtml, 'Fuzzy slippers (size 8)\n  - anything &lt;matcha&gt; &amp; tea', 'shown as the same text, never as HTML');
    assert.equal(ana.hardNosHtml, 'No candles');

    const ben = (await call('/api/santa/tok-ben')).body;
    assert.deepEqual([ben.me.wishlistHtml, ben.me.hardNosHtml], ['', ''], 'people with no lists yet still work');
    assert.equal(ben.recipient.wishlistHtml, 'Fuzzy slippers (size 8)\n  - anything &lt;matcha&gt; &amp; tea', "an already-unwrapped Santa still sees Ana's list");
    assert.equal((await call('/api/admin/admin-1')).body.participants.find((p) => p.name === 'Ana').hasWishlist, true);
  } finally {
    close();
  }
});

test('formatted lists keep bold, italics, lists, and links, and drop anything unsafe', async () => {
  const { call, close } = await start(liveShaped);
  try {
    const saved = await call('/api/santa/tok-cy/wishlist', 'PUT', {
      wishlistHtml: '<p><b>Socks</b> and <i>tea</i><script>alert(1)</script></p><ul><li onclick="x()">Puzzle</li></ul>'
        + '<p><a href="https://example.com/gift">this one</a> <a href="javascript:alert(1)">bad</a> <img src=x onerror=alert(1)></p>',
      hardNosHtml: '<p style="color:red">No <u>mugs</u></p>',
    });
    assert.equal(saved.status, 200);
    const { wishlistHtml, hardNosHtml, wishlist, hardNos } = saved.body.me;
    assert.match(wishlistHtml, /<b>Socks<\/b>/);
    assert.match(wishlistHtml, /<i>tea<\/i>/);
    assert.match(wishlistHtml, /<ul><li>Puzzle<\/li><\/ul>/);
    assert.match(wishlistHtml, /<a href="https:\/\/example.com\/gift" target="_blank" rel="noopener noreferrer nofollow">this one<\/a>/);
    for (const unsafe of ['script', 'alert', 'onclick', 'javascript:', '<img', 'onerror']) {
      assert.ok(!wishlistHtml.includes(unsafe), `${unsafe} is removed`);
    }
    assert.equal(hardNosHtml, '<p>No <u>mugs</u></p>', 'styles are dropped, simple formatting stays');
    assert.equal(wishlist, 'Socks and tea\n• Puzzle\nthis one bad', 'a plain-text copy is kept for older pages');
    assert.equal(hardNos, 'No mugs');
  } finally {
    close();
  }
});

test('a page opened before the update can still save plain text', async () => {
  const { call, close } = await start(liveShaped);
  try {
    await call('/api/santa/tok-cy/wishlist', 'PUT', { wishlistHtml: '<p><b>Old</b></p>', hardNosHtml: '' });
    const plain = (await call('/api/santa/tok-cy/wishlist', 'PUT', { wishlist: 'Just <socks>', hardNos: '' })).body.me;
    assert.equal(plain.wishlist, 'Just <socks>');
    assert.equal(plain.wishlistHtml, 'Just &lt;socks&gt;', 'the newer plain save replaces the formatted one');
  } finally {
    close();
  }
});

test('formatted lists have the same 1000-character limit, counted on the words', async () => {
  const { call, close } = await start(liveShaped);
  try {
    const long = `<p><b>${'x'.repeat(1001)}</b></p>`;
    assert.equal((await call('/api/santa/tok-cy/wishlist', 'PUT', { wishlistHtml: long, hardNosHtml: '' })).status, 400);
    const fits = `<p><b>${'x'.repeat(990)}</b></p>`;
    assert.equal((await call('/api/santa/tok-cy/wishlist', 'PUT', { wishlistHtml: fits, hardNosHtml: '' })).status, 200);
    const empty = (await call('/api/santa/tok-cy/wishlist', 'PUT', { wishlistHtml: '<p><br></p>', hardNosHtml: '<ul><li></li></ul>' })).body.me;
    assert.deepEqual([empty.wishlistHtml, empty.hardNosHtml], ['', ''], 'an empty editor counts as no list');
  } finally {
    close();
  }
});

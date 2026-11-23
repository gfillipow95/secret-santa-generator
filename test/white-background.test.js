import assert from 'node:assert/strict';
import { test } from 'node:test';
import { edgeBlackShare, whitenEdgeBlack } from '../public/white-background.js';

// Paints an image from rows of characters: '.' black, 'k' black inside the picture, 'w' white, 'r' red.
function picture(rows) {
  const colors = { '.': [0, 0, 0], k: [6, 4, 8], w: [255, 255, 255], r: [200, 40, 30] };
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.join('').split('').forEach((ch, i) => data.set([...colors[ch], 255], i * 4));
  return { data, width, height };
}

const pixel = (image, x, y) => [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)];

test('black that touches the edge turns white, black inside the picture stays', () => {
  const image = picture([
    '......',
    '.rrrr.',
    '.rkkr.',
    '.rrrr.',
    '......',
  ]);
  assert.equal(edgeBlackShare(image), 1);
  whitenEdgeBlack(image);
  assert.deepEqual(pixel(image, 0, 0), [255, 255, 255]);
  assert.deepEqual(pixel(image, 5, 4), [255, 255, 255]);
  assert.deepEqual(pixel(image, 1, 1), [200, 40, 30], 'the picture itself is untouched');
  assert.deepEqual(pixel(image, 2, 2), [6, 4, 8], 'enclosed black, like hair or eyes, stays black');
  assert.equal(edgeBlackShare(image), 0);
});

test('a normal photo has no black edge to clean up', () => {
  const image = picture([
    'wwww',
    'wrrw',
    'wwww',
  ]);
  assert.equal(edgeBlackShare(image), 0);
  whitenEdgeBlack(image);
  assert.deepEqual(pixel(image, 1, 1), [200, 40, 30]);
});

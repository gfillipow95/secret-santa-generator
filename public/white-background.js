// Phones sometimes flatten a picture's transparent background to pure black
// before the browser ever sees it. These find that black, which always
// touches the edge, and turn it white without touching black inside the
// picture. They work on raw RGBA pixels ({ data, width, height }).

const NEAR_BLACK = 24;

const isBlack = (data, i) => data[i] <= NEAR_BLACK && data[i + 1] <= NEAR_BLACK && data[i + 2] <= NEAR_BLACK;

function edgePixels(width, height) {
  const edge = [];
  for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) edge.push(y * width, y * width + width - 1);
  return edge;
}

/** The share of edge pixels that are black, from 0 to 1. */
export function edgeBlackShare({ data, width, height }) {
  const edge = edgePixels(width, height);
  return edge.filter((p) => isBlack(data, p * 4)).length / edge.length;
}

/** Turns every black pixel connected to the edge white, in place. */
export function whitenEdgeBlack({ data, width, height }) {
  const seen = new Uint8Array(width * height);
  const stack = edgePixels(width, height).filter((p) => isBlack(data, p * 4));
  for (const p of stack) seen[p] = 1;
  while (stack.length) {
    const p = stack.pop();
    data.set([255, 255, 255, 255], p * 4);
    const x = p % width;
    const neighbors = [p - width, p + width, x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1];
    for (const n of neighbors) {
      if (n >= 0 && n < seen.length && !seen[n] && isBlack(data, n * 4)) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
}

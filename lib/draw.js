function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Depth-first search for any valid draw. Only used to tell whether one exists. */
function anyDraw(ids, allowed) {
  const taken = new Set();
  const result = {};
  const place = (index) => {
    if (index === ids.length) return true;
    const giver = ids[index];
    for (const receiver of ids) {
      if (taken.has(receiver) || !allowed(giver, receiver)) continue;
      taken.add(receiver);
      result[giver] = receiver;
      if (place(index + 1)) return true;
      taken.delete(receiver);
    }
    return false;
  };
  return place(0) ? result : null;
}

const MAX_TRIES = 10_000;

/**
 * Assigns every id a recipient so nobody draws themselves or anyone they're
 * blocked from (blocking is symmetric). Every valid draw is equally likely:
 * it shuffles until one fits. Returns { giverId: receiverId }, or null when
 * the rules leave no valid draw.
 */
export function drawAssignments(ids, blockedPairs = [], random = Math.random) {
  const blocked = new Set(blockedPairs.flatMap(([a, b]) => [`${a}>${b}`, `${b}>${a}`]));
  const allowed = (giver, receiver) => giver !== receiver && !blocked.has(`${giver}>${receiver}`);
  if (ids.length < 2 || !anyDraw(ids, allowed)) return null;

  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const receivers = shuffled(ids, random);
    if (ids.every((giver, i) => allowed(giver, receivers[i]))) {
      return Object.fromEntries(ids.map((giver, i) => [giver, receivers[i]]));
    }
  }
  return anyDraw(shuffled(ids, random), allowed);
}

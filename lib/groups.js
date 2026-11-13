import { randomBytes } from 'node:crypto';
import { drawAssignments } from './draw.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (message) => new HttpError(400, message);
const conflict = (message) => new HttpError(409, message);

const MIN_PEOPLE = 3;
const MAX_PEOPLE = 100;

const secret = () => randomBytes(16).toString('base64url');
const shortId = () => randomBytes(6).toString('base64url');

function text(value, max, label, { required = false } = {}) {
  if (value == null) value = '';
  if (typeof value !== 'string') throw bad(`${label} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw bad(`${label} is required.`);
  if (trimmed.length > max) throw bad(`${label} must be ${max} characters or fewer.`);
  return trimmed;
}

function date(value) {
  const parsed = text(value, 10, 'Exchange date');
  if (!parsed) return parsed;
  const [year, month, day] = parsed.split('-').map(Number);
  const real = new Date(Date.UTC(year, month - 1, day));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) {
    throw bad('Exchange date must be a real date, like 2026-12-24.');
  }
  return parsed;
}

function parseRoster(participants, couples = []) {
  if (!Array.isArray(participants)) throw bad('Participants must be a list.');
  if (!Array.isArray(couples)) throw bad('Couples must be a list.');

  const people = participants.map((person) => ({
    id: typeof person?.id === 'string' ? person.id : undefined,
    name: text(person?.name, 40, 'Each name', { required: true }),
  }));
  if (people.length < MIN_PEOPLE) throw bad(`Add at least ${MIN_PEOPLE} people.`);
  if (people.length > MAX_PEOPLE) throw bad(`That's more than ${MAX_PEOPLE} people. Santa needs a bigger sleigh.`);

  const ids = people.map((person) => person.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw bad('The same person is on the list twice.');

  const keyOf = new Map();
  for (const { name } of people) {
    const key = name.toLowerCase();
    if (keyOf.has(key)) throw bad(`"${name}" is on the list twice. Add a last initial to tell them apart.`);
    keyOf.set(key, name);
  }

  const paired = new Set();
  const pairs = couples.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw bad('Each couple must be two names.');
    const keys = pair.map((name) => {
      const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
      if (!keyOf.has(key)) throw bad(`"${name}" is in a couple but not on the list.`);
      return key;
    });
    if (keys[0] === keys[1]) throw bad('Someone is paired with themselves.');
    for (const key of keys) {
      if (paired.has(key)) throw bad(`${keyOf.get(key)} is in more than one couple.`);
      paired.add(key);
    }
    return keys;
  });

  if (!drawAssignments([...keyOf.keys()], pairs)) {
    throw bad("With these couples there's no way to draw names. Add more people.");
  }
  return { people, couples: pairs };
}

/** Parses an untrusted create/update body. `roster` is null when the body leaves people out. */
export function parseSetup(body, { requireRoster = false } = {}) {
  if (typeof body !== 'object' || body === null) throw bad('Expected a JSON object.');
  const settings = {
    name: text(body.name, 60, 'Exchange name', { required: true }),
    organizer: text(body.organizer, 40, 'Organizer name'),
    budget: text(body.budget, 30, 'Budget'),
    date: date(body.date),
    note: text(body.note, 500, 'Note'),
  };
  const hasRoster = body.participants !== undefined;
  if (requireRoster && !hasRoster) throw bad('Add some people first.');
  return { settings, roster: hasRoster ? parseRoster(body.participants, body.couples) : null };
}

const newParticipant = (name) => ({ id: shortId(), token: secret(), name, photo: null, revealedAt: null });

/** Keeps everyone's link through edits: people are matched by id, or by name if they were removed and added back. */
function applyRoster(group, roster) {
  const byId = new Map(group.participants.map((person) => [person.id, person]));
  const claimed = new Set(roster.people.map(({ id }) => id).filter((id) => byId.has(id)));
  const byName = new Map(group.participants
    .filter((person) => !claimed.has(person.id))
    .map((person) => [person.name.toLowerCase(), person]));
  group.participants = roster.people.map(({ id, name }) => {
    const kept = byId.get(id) ?? byName.get(name.toLowerCase());
    return kept ? { ...kept, name } : newParticipant(name);
  });
  const idOf = new Map(group.participants.map((person) => [person.name.toLowerCase(), person.id]));
  group.couples = roster.couples.map((pair) => pair.map((key) => idOf.get(key)));
}

export function createGroup({ settings, roster }) {
  const group = {
    id: shortId(),
    adminToken: secret(),
    createdAt: new Date().toISOString(),
    ...settings,
    participants: [],
    couples: [],
    assignments: null,
    drawnAt: null,
  };
  applyRoster(group, roster);
  return group;
}

export function updateGroup(group, { settings, roster }) {
  if (roster && group.assignments) throw conflict('Names are already drawn. Reset the draw to change who is in.');
  Object.assign(group, settings);
  if (roster) applyRoster(group, roster);
}

export function drawGroup(group) {
  if (group.assignments) throw conflict('Names are already drawn.');
  const assignments = drawAssignments(group.participants.map((p) => p.id), group.couples);
  if (!assignments) throw conflict("There's no valid way to draw names with these couples.");
  group.assignments = assignments;
  group.drawnAt = new Date().toISOString();
}

export function resetDraw(group) {
  group.assignments = null;
  group.drawnAt = null;
  for (const person of group.participants) person.revealedAt = null;
}

export function markRevealed(group, person) {
  if (!group.assignments) throw conflict("Names haven't been drawn yet.");
  person.revealedAt ??= new Date().toISOString();
}

const photoUrl = (person) => (person.photo ? `/photos/${person.photo}.jpg` : null);

const details = ({ name, organizer = '', budget, date, note }) => ({ name, organizer, budget, date, note });

/** The organizer sees links and progress, never who drew whom. */
export function adminView(group) {
  const nameOf = new Map(group.participants.map((p) => [p.id, p.name]));
  return {
    ...details(group),
    drawn: Boolean(group.assignments),
    drawnAt: group.drawnAt,
    participants: group.participants.map((p) => ({
      id: p.id,
      name: p.name,
      token: p.token,
      photo: photoUrl(p),
      revealed: Boolean(p.revealedAt),
    })),
    couples: group.couples.map((pair) => pair.map((id) => nameOf.get(id))),
  };
}

/** A participant sees only themselves and, once they open their gift, their own recipient. */
export function participantView(group, person) {
  const recipientId = person.revealedAt && group.assignments?.[person.id];
  const recipient = recipientId && group.participants.find((p) => p.id === recipientId);
  return {
    exchange: details(group),
    me: { name: person.name, photo: photoUrl(person) },
    drawn: Boolean(group.assignments),
    revealed: Boolean(person.revealedAt),
    recipient: recipient ? { name: recipient.name, photo: photoUrl(recipient) } : null,
  };
}

import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  HttpError, adminView, createGroup, drawGroup, markRevealed, parseSetup,
  participantView, resetDraw, updateGroup,
} from './groups.js';
import { openStore } from './store.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const notFound = () => new HttpError(404, "We couldn't find that link. Double-check it with your organizer.");

const MAX_WRONG_TRIES = 10;
const WRONG_TRY_WINDOW_MS = 60_000;

/** Checks the passcode for creating exchanges. A burst of wrong guesses pauses everyone for a minute, so it can't be brute-forced. */
function passcodeGate(passcode) {
  if (!passcode) return () => {};
  const digest = (value) => createHash('sha256').update(value).digest();
  const expected = digest(passcode);
  let wrongTries = [];
  return (attempt) => {
    const now = Date.now();
    wrongTries = wrongTries.filter((time) => now - time < WRONG_TRY_WINDOW_MS);
    if (wrongTries.length >= MAX_WRONG_TRIES) throw new HttpError(429, 'Too many wrong passcodes. Wait a minute and try again.');
    if (typeof attempt !== 'string' || !attempt) throw new HttpError(401, 'Enter the passcode to create an exchange.');
    if (!timingSafeEqual(digest(attempt), expected)) {
      wrongTries.push(now);
      throw new HttpError(401, "That passcode isn't right.");
    }
  };
}

export function createApp({ dataFile, createPasscode }) {
  const store = openStore(dataFile);
  const checkPasscode = passcodeGate(createPasscode);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use(express.json({ limit: '50kb' }));
  app.use(express.static(publicDir));

  app.get('/admin/:token', (req, res) => res.sendFile('admin.html', { root: publicDir }));
  app.get('/santa/:token', (req, res) => res.sendFile('santa.html', { root: publicDir }));

  const found = (value) => {
    if (!value) throw notFound();
    return value;
  };
  const organizerGroup = (req) => found(store.findByAdminToken(req.params.token));
  const santa = (req) => found(store.findByParticipantToken(req.params.token));

  app.get('/api/config', (req, res) => res.json({ passcodeRequired: Boolean(createPasscode) }));

  app.post('/api/groups', (req, res) => {
    checkPasscode(req.body?.passcode);
    const group = createGroup(parseSetup(req.body, { requireRoster: true }));
    store.save(group);
    res.status(201).json({ adminToken: group.adminToken });
  });

  app.get('/api/admin/:token', (req, res) => res.json(adminView(organizerGroup(req))));

  app.put('/api/admin/:token', (req, res) => {
    const group = organizerGroup(req);
    updateGroup(group, parseSetup(req.body));
    store.save(group);
    res.json(adminView(group));
  });

  app.post('/api/admin/:token/draw', (req, res) => {
    const group = organizerGroup(req);
    drawGroup(group);
    store.save(group);
    res.json(adminView(group));
  });

  app.post('/api/admin/:token/reset', (req, res) => {
    const group = organizerGroup(req);
    resetDraw(group);
    store.save(group);
    res.json(adminView(group));
  });

  app.get('/api/santa/:token', (req, res) => {
    const { group, person } = santa(req);
    res.json(participantView(group, person));
  });

  app.post('/api/santa/:token/reveal', (req, res) => {
    const { group, person } = santa(req);
    markRevealed(group, person);
    store.save(group);
    res.json(participantView(group, person));
  });

  app.use('/api', () => { throw new HttpError(404, 'Not found.'); });

  app.use((err, req, res, next) => {
    const status = err instanceof HttpError ? err.status : err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong at the North Pole.' : err.message });
  });

  return app;
}

import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HttpError, adminView, createGroup, drawGroup, markRevealed, parseSetup,
  participantView, resetDraw, updateGroup,
} from './groups.js';
import { isJpeg, openPhotos } from './photos.js';
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
  const photos = openPhotos(join(dirname(dataFile), 'photos'));
  const checkPasscode = passcodeGate(createPasscode);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use(express.json({ limit: '50kb' }));
  app.use(express.static(publicDir));
  app.use('/photos', express.static(photos.dir, { index: false, maxAge: '365d', immutable: true }));

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
    const photosBefore = group.participants.map((p) => p.photo);
    updateGroup(group, parseSetup(req.body));
    store.save(group);
    const kept = new Set(group.participants.map((p) => p.photo));
    for (const photo of photosBefore) if (!kept.has(photo)) photos.remove(photo);
    res.json(adminView(group));
  });

  const personOf = (group, req) => found(group.participants.find((p) => p.id === req.params.id));
  const setPhoto = (group, person, photo) => {
    const old = person.photo;
    person.photo = photo;
    store.save(group);
    photos.remove(old);
  };

  app.put('/api/admin/:token/people/:id/photo', express.raw({ type: 'image/jpeg', limit: '300kb' }), (req, res) => {
    const group = organizerGroup(req);
    const person = personOf(group, req);
    if (!isJpeg(req.body)) throw new HttpError(415, 'Photos need to be JPEG images.');
    setPhoto(group, person, photos.write(req.body));
    res.json(adminView(group));
  });

  app.delete('/api/admin/:token/people/:id/photo', (req, res) => {
    const group = organizerGroup(req);
    setPhoto(group, personOf(group, req), null);
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
    const message = status >= 500 ? 'Something went wrong at the North Pole.'
      : status === 413 ? "That's too big to upload."
        : err.message;
    res.status(status).json({ error: message });
  });

  return app;
}

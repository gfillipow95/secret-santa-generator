import express from 'express';
import { fileURLToPath } from 'node:url';
import {
  HttpError, adminView, createGroup, drawGroup, markRevealed, parseSetup,
  participantView, resetDraw, updateGroup,
} from './groups.js';
import { openStore } from './store.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const notFound = () => new HttpError(404, "We couldn't find that link. Double-check it with your organizer.");

export function createApp({ dataFile }) {
  const store = openStore(dataFile);
  const app = express();
  app.disable('x-powered-by');
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

  app.post('/api/groups', (req, res) => {
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

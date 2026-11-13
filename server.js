import { join } from 'node:path';
import { createApp } from './lib/app.js';

const port = Number(process.env.PORT ?? 3000);
const dataFile = join(process.env.DATA_DIR ?? 'data', 'secret-santa.json');

createApp({ dataFile }).listen(port, () => {
  console.log(`🎅 Secret Santa is running at http://localhost:${port}`);
});

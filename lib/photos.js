import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const isJpeg = (bytes) => Buffer.isBuffer(bytes) && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/** Photos live next to the data file, one JPEG each, under a random name that changes whenever the photo does. */
export function openPhotos(dir) {
  return {
    dir,
    write(bytes) {
      mkdirSync(dir, { recursive: true });
      const id = randomBytes(16).toString('base64url');
      writeFileSync(join(dir, `${id}.jpg`), bytes);
      return id;
    },
    remove(id) {
      if (id) rmSync(join(dir, `${id}.jpg`), { force: true });
    },
  };
}

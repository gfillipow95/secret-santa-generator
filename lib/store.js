import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Every group lives in one JSON file, written atomically after each change. */
export function openStore(file) {
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { groups: {} };
  const groups = () => Object.values(data.groups);

  return {
    save(group) {
      data.groups[group.id] = group;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
      renameSync(`${file}.tmp`, file);
    },
    findByAdminToken(token) {
      return groups().find((group) => group.adminToken === token);
    },
    findByParticipantToken(token) {
      for (const group of groups()) {
        const person = group.participants.find((p) => p.token === token);
        if (person) return { group, person };
      }
      return undefined;
    },
  };
}

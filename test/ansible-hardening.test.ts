import { describe, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

describe('Ansible hardening', () => {
  test('does not grant passwordless sudo to the app user', async () => {
    const provision = await fs.readFile(path.join(repoRoot, 'ansible', 'provision.yml'), 'utf-8');

    expect(provision).not.toContain('NOPASSWD:ALL');
    expect(provision).not.toContain('/etc/sudoers.d/{{ app_user }}');
  });
});

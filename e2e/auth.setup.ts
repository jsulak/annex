import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const authFile = path.join(import.meta.dirname, '.auth', 'user.json');

setup('authenticate', async ({ request }) => {
  const response = await request.post('/api/v1/auth/login', {
    data: { password: 'testpassword123' },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }

  // Save signed-in state for reuse
  await request.storageState({ path: authFile });
});

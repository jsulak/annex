import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  const markerPath = path.join(import.meta.dirname, '.test-notes-dir');
  if (fs.existsSync(markerPath)) {
    const tmpDir = fs.readFileSync(markerPath, 'utf-8').trim();
    if (tmpDir && tmpDir.includes('zettelweb-e2e-')) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log(`Cleaned up E2E temp dir: ${tmpDir}`);
    }
    fs.unlinkSync(markerPath);
  }
}

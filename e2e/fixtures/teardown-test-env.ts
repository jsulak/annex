import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  const markerPath = path.join(import.meta.dirname, '.test-notes-dir');
  if (fs.existsSync(markerPath)) {
    const tmpDir = fs.readFileSync(markerPath, 'utf-8').trim();
    if (tmpDir && tmpDir.includes('annex-e2e-')) {
      const semanticIndexFile = path.join(tmpDir, '..', `${path.basename(tmpDir)}-semantic.sqlite`);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(semanticIndexFile, { force: true });
      fs.rmSync(`${semanticIndexFile}-wal`, { force: true });
      fs.rmSync(`${semanticIndexFile}-shm`, { force: true });
      console.log(`Cleaned up E2E temp dir: ${tmpDir}`);
    }
    fs.unlinkSync(markerPath);
  }
}

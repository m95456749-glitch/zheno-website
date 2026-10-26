// Build with public dummy endpoints to ensure branch previews cannot inherit them.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, WORKERS_CI: '1', WORKERS_CI_BRANCH: 'arena/preview-isolation-test',
    VITE_SUPABASE_URL: 'https://preview-isolation-sentinel.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preview_isolation_sentinel',
    VITE_API_BASE_URL: 'https://preview-isolation-sentinel.example/api',
    VITE_ASSISTANT_API_URL: 'https://preview-isolation-sentinel.example/assistant',
    VITE_ADMIN_AUTH_MODE: 'supabase' },
});
assert.equal(result.status, 0, 'Preview build failed');
assert.doesNotMatch(readFileSync('dist/index.html', 'utf8'), /preview-isolation-sentinel|sb_publishable_preview_isolation_sentinel/);
console.log('PASS: Worker PR bundle excludes inherited backend endpoints and public key');

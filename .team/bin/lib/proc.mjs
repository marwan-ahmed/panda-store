// Marwan SAT — process and hashing helpers.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function sha256File(path) {
  // Normalise line endings so a CRLF checkout on Windows does not look "modified".
  const buf = readFileSync(path);
  const text = buf.toString('utf8');
  return sha256(text.includes('\r\n') ? text.replace(/\r\n/g, '\n') : buf);
}

export function firstToken(command) {
  const m = /^\s*(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(command || '');
  return m ? m[1] || m[2] || m[3] : null;
}

export function commandExists(bin) {
  if (!bin) return false;
  const res =
    process.platform === 'win32'
      ? spawnSync('where', [bin], { encoding: 'utf8' })
      : spawnSync('sh', ['-c', `command -v "${bin.replace(/"/g, '')}"`], { encoding: 'utf8' });
  return res.status === 0;
}

export function runShell(command, { cwd, timeoutMs }) {
  const started = Date.now();
  const env = { ...process.env, FORCE_COLOR: '0' };
  delete env.NODE_TEST_CONTEXT;
  const res = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMs,
    env,
  });
  return {
    exitCode: res.status === null ? (res.error ? 127 : 124) : res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || (res.error ? String(res.error.message) : ''),
    durationMs: Date.now() - started,
    timedOut: res.error && res.error.code === 'ETIMEDOUT',
  };
}

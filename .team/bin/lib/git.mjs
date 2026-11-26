// Marwan SAT — thin, synchronous git helpers.
import { execFileSync } from 'node:child_process';

export function git(args, cwd, { allowFail = false, raw = false } = {}) {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return raw ? out : out.trim();
  } catch (err) {
    if (allowFail) return null;
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  }
}

export function isGitRepo(cwd) {
  return git(['rev-parse', '--is-inside-work-tree'], cwd, { allowFail: true }) === 'true';
}

export function headSha(cwd) {
  return git(['rev-parse', 'HEAD'], cwd, { allowFail: true });
}

export function currentBranch(cwd) {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, { allowFail: true });
}

export function isDirty(cwd) {
  const out = git(['status', '--porcelain'], cwd);
  return out.length > 0;
}

// Paths with uncommitted changes (staged, unstaged or untracked), NUL-safe.
export function porcelainFiles(cwd) {
  const out = git(['status', '--porcelain', '-z', '--untracked-files=all'], cwd, { raw: true });
  if (!out) return [];
  const parts = out.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    files.push(entry.slice(3));
    if (status.includes('R') || status.includes('C')) i += 1; // skip the original path
  }
  return files;
}

// Files changed between <base> and the working tree, plus untracked files.
export function changedSince(base, cwd) {
  const tracked = git(['diff', '--name-only', base], cwd);
  const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd);
  const all = new Set();
  for (const block of [tracked, untracked]) {
    if (!block) continue;
    for (const line of block.split('\n')) if (line.trim()) all.add(line.trim());
  }
  return [...all].sort();
}

export function mergeBase(a, b, cwd) {
  return git(['merge-base', a, b], cwd, { allowFail: true });
}

// True when <a> is an ancestor of (or equal to) <b>.
export function isAncestor(a, b, cwd) {
  return git(['merge-base', '--is-ancestor', a, b], cwd, { allowFail: true }) !== null;
}

// The commit a task's changes are measured from. Normally the commit the task started on; but when the
// base branch moved forward and was merged into the task branch (e.g. a SAT update), the merge base with
// the base branch is used instead, so changes that came from the base branch are not counted as the task's.
// Both the local base branch and its remote-tracking branch are considered (a stale local "main" must not
// hide a merge of "origin/main"); the most recent merge base wins.
export function effectiveBase(cwd, baseBranch, taskBaseSha) {
  let best = null;
  for (const ref of baseBranch ? [baseBranch, `origin/${baseBranch}`] : []) {
    const mb = mergeBase(ref, 'HEAD', cwd);
    if (!mb || (taskBaseSha && !isAncestor(taskBaseSha, mb, cwd))) continue;
    if (!best || (mb !== best && isAncestor(best, mb, cwd))) best = mb;
  }
  return best || taskBaseSha || null;
}

// Content of <path> at <rev>, or null when it does not exist there.
export function showFile(rev, path, cwd) {
  return git(['show', `${rev}:${path}`], cwd, { allowFail: true, raw: true });
}

export function filesAt(rev, cwd) {
  const out = git(['ls-tree', '-r', '--name-only', rev], cwd, { allowFail: true });
  return out ? out.split('\n').filter(Boolean) : [];
}

export function remoteUrl(cwd, name = 'origin') {
  return git(['remote', 'get-url', name], cwd, { allowFail: true });
}

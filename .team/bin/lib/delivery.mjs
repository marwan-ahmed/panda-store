// Marwan SAT — delivery: the git and GitHub steps the owner no longer runs by hand (charter §6.3).
//
// The owner writes a request, replies with the exact phrases, and presses Merge on GitHub. Everything else —
// going back to the base branch and updating it, committing the task records, pushing the branch, opening the
// pull request, closing a task once it is merged — is done here. The one step that stays with the owner is
// the Merge itself: with branch protection on, no agent can do it (charter §10, §14.2).
//
// A task is "merged" when its folder reached the base branch: the check reads content, not commit ancestry,
// so a merge commit, a squash or a rebase all count.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commandExists } from './proc.mjs';
import { currentBranch, git, porcelainFiles, remoteUrl, showFile } from './git.mjs';
import { appendLedger, listTasks, readJSON, readState, taskDir, taskRel, TERMINAL, writeState, writeTask } from './state.mjs';

export const FINAL_GATES = ['GATE_2', 'GATE_A'];
export const UPDATE_BRANCH_PREFIX = 'chore/sat-';
const LEDGER = '.team/LEDGER.jsonl';

// A failure the tech manager relays to the owner as it is: it says what waits and what to do.
export class DeliveryError extends Error {}

export function hasRemote(root) {
  return Boolean(remoteUrl(root));
}

// owner/repo of a GitHub origin (https or ssh), for links; null for any other host.
export function githubRepo(root) {
  const url = remoteUrl(root) || '';
  const m = /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function refExists(root, ref) {
  return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], root, { allowFail: true }) !== null;
}

// The ref that says what is merged: the remote base branch when there is one, else the local one.
export function mergedRef(root, base) {
  return hasRemote(root) && refExists(root, `origin/${base}`) ? `origin/${base}` : base;
}

// Refresh origin/<base>. Offline is not an error: the checks then use what was fetched last.
export function fetchBase(root, base) {
  if (!hasRemote(root)) return { ok: false, why: 'no remote' };
  const r = git(['fetch', '--quiet', 'origin', base], root, { allowFail: true });
  return r === null ? { ok: false, why: `could not reach origin to fetch ${base}` } : { ok: true };
}

// Has this task's folder reached the base branch at a final gate (or later)?
export function taskOnBase(root, ref, id) {
  const raw = showFile(ref, `${taskRel(id)}/task.json`, root);
  if (!raw) return false;
  try {
    return [...FINAL_GATES, 'CLOSED'].includes(JSON.parse(raw).phase);
  } catch {
    return false;
  }
}

// Has the SAT version installed on this branch reached the base branch?
export function updateOnBase(root, ref) {
  const here = readJSON(join(root, '.team', 'sat.lock'), null);
  const there = showFile(ref, '.team/sat.lock', root);
  if (!here || !there) return false;
  try {
    return JSON.parse(there).sat_version === here.sat_version;
  } catch {
    return false;
  }
}

// Stage and commit the given paths only (those that exist or are tracked). Returns the new sha, or null.
export function commitPaths(root, paths, message) {
  const present = paths.filter((p) => existsSync(join(root, p)) || git(['ls-files', '--error-unmatch', p], root, { allowFail: true }) !== null);
  if (!present.length) return null;
  git(['add', '-A', '--', ...present], root);
  const staged = git(['diff', '--cached', '--name-only'], root);
  if (!staged) return null;
  git(['commit', '-q', '-m', message], root);
  return git(['rev-parse', 'HEAD'], root);
}

export function pushBranch(root, branch) {
  if (!hasRemote(root)) return { ok: false, why: 'This repository has no remote (origin): push the branch and open the PR on your Git host yourself.' };
  try {
    git(['push', '--quiet', '-u', 'origin', branch], root);
    return { ok: true };
  } catch (e) {
    return { ok: false, why: `git push failed (network or GitHub sign-in): ${e.message.split('\n').slice(-2).join(' ')}. Fix it, then run: node .team/bin/phase.mjs ship` };
  }
}

function gh(args, root) {
  const r = spawnSync('gh', args, { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// Open (or find) the pull request of <branch>. With a signed-in gh the PR is created; otherwise the owner gets
// a link that opens GitHub's "Create pull request" page with everything filled in.
export function openPullRequest(root, { base, branch, title, body }) {
  const repo = githubRepo(root);
  if (!repo) return { url: null, how: null };
  if (commandExists('gh')) {
    const existing = gh(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '-q', '.[0].url'], root);
    if (existing.ok && existing.out) return { url: existing.out, how: 'gh' };
    const created = gh(['pr', 'create', '--base', base, '--head', branch, '--title', title, '--body', body], root);
    const url = created.ok ? created.out.split(/\s+/).find((w) => /^https:\/\/github\.com\/.+\/pull\/\d+/.test(w)) : null;
    if (url) return { url, how: 'gh' };
  }
  const link = `https://github.com/${repo.owner}/${repo.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1&title=${encodeURIComponent(title)}`;
  return { url: link, how: 'link' };
}

// Commit the records of a task, push its branch and open its PR. Records only: code is committed by the
// implementer and checked by verify before this point.
export function shipTask(root, cfg, task, message) {
  const paths = [taskRel(task.id), LEDGER];
  if (task.kind !== 'audit') paths.push('.team/DECISIONS.md');
  const sha = commitPaths(root, paths, message);
  const leftovers = porcelainFiles(root).filter((f) => !f.startsWith('.team/STATE.json'));
  const push = pushBranch(root, task.branch);
  const result = { committed: sha, leftovers, pushed: push.ok, why: push.why || null, pr: null };
  if (push.ok) {
    const doc = task.kind === 'audit' ? 'BACKLOG.md' : 'REPORT.md';
    result.pr = openPullRequest(root, {
      base: cfg.git.base_branch,
      branch: task.branch,
      title: `${task.id}: ${task.title}`,
      body: `Marwan SAT — ${task.kind === 'audit' ? 'audit backlog' : 'task report'}: ${taskRel(task.id)}/${doc}\n\nMerging this pull request is the owner's approval (charter §6).`,
    });
    const st = readState(root) || {};
    writeState(root, { ...st, pr: { task: task.id, url: result.pr.url, how: result.pr.how } });
  }
  return result;
}

export function printShip(r) {
  if (r.committed) console.log(`[SAT] Committed the task records (${r.committed.slice(0, 10)}).`);
  if (r.leftovers.length) console.log(`[SAT] ! Uncommitted files remain outside the task records:\n  - ${r.leftovers.slice(0, 10).join('\n  - ')}`);
  if (!r.pushed) return console.log(`[SAT] ! Not pushed: ${r.why}`);
  console.log('[SAT] Pushed the task branch.');
  if (r.pr && r.pr.how === 'gh') console.log(`[SAT] Pull request: ${r.pr.url}`);
  else if (r.pr && r.pr.url) console.log(`[SAT] Pull request link (the owner presses "Create pull request" once, then Merge): ${r.pr.url}`);
  else console.log('[SAT] The remote is not GitHub: open the pull request on your Git host.');
  return undefined;
}

// Tasks that sit on the checked-out base branch at a final gate: they got there only through the owner's
// Merge, which is the approval (charter §6).
export function mergedTasksOnBase(root) {
  return listTasks(root).filter((id) => FINAL_GATES.includes((readJSON(join(taskDir(root, id), 'task.json'), {}) || {}).phase));
}

// Close them. Returns the ids closed, with any risk that was merged without the owner's written acceptance.
export function closeMergedTasks(root, ids) {
  const closed = [];
  for (const id of ids) {
    const t = readJSON(join(taskDir(root, id), 'task.json'), null);
    if (!t || !FINAL_GATES.includes(t.phase)) continue;
    const at = new Date().toISOString();
    const from = t.phase;
    const unaccepted = (t.acceptance_needed || []).filter((x) => !(t.risk_accepted && (t.risk_accepted.ids || []).includes(x)));
    t.gates = t.gates || {};
    t.gates[from] = [...(t.gates[from] || []), { decision: 'approve', via: 'merge', note: 'Merged on GitHub by the owner', at }];
    t.phase = 'CLOSED';
    t.history = [...(t.history || []), { phase: 'CLOSED', at, from, via: 'merge' }];
    writeTask(root, t);
    appendLedger(root, { type: 'phase', task: id, from, to: 'CLOSED', via: 'merge', ...(unaccepted.length ? { merged_without_acceptance: unaccepted } : {}) });
    closed.push({ id, unaccepted });
  }
  return closed;
}

// Uncommitted ledger lines survive a branch switch: they are taken off, and appended again afterwards.
function takeLedgerTail(root) {
  const p = join(root, LEDGER);
  if (!existsSync(p)) return '';
  const committed = showFile('HEAD', LEDGER, root) || '';
  const now = readFileSync(p, 'utf8');
  if (now === committed) return '';
  git(['checkout', '--', LEDGER], root, { allowFail: true });
  return now.startsWith(committed) ? now.slice(committed.length) : '';
}

// Before new work (a task or a team update): wait for an unmerged delivery, leave a finished SAT branch and
// bring the base branch up to date. Returns { base, toClose }: the merged tasks to close once the new work
// is sure to start (closeMergedTasks), so a refused command leaves no half-written records behind.
export function prepareBase(root, cfg) {
  const base = cfg.git.base_branch;
  const prefix = cfg.git.task_branch_prefix;
  fetchBase(root, base);
  const ref = mergedRef(root, base);
  const st = readState(root) || {};
  if (st.active_task) {
    const t = readJSON(join(taskDir(root, st.active_task), 'task.json'), null);
    if (t && FINAL_GATES.includes(t.phase)) {
      if (!taskOnBase(root, ref, t.id))
        throw new DeliveryError(
          `${t.id} is waiting for the owner to press Merge on GitHub${st.pr && st.pr.task === t.id && st.pr.url ? `: ${st.pr.url}` : ''}. Merging is the approval; nothing new starts before it. (To drop it instead: phase cancel.)`,
        );
    } else if (t && !TERMINAL.includes(t.phase)) throw new DeliveryError(`Task ${t.id} is still active (${t.phase}). Finish or cancel it first.`);
  }
  const cur = currentBranch(root);
  let tail = '';
  if (cur && cur !== base) {
    if (cur.startsWith(prefix)) {
      const id = cur.slice(prefix.length);
      const t = readJSON(join(taskDir(root, id), 'task.json'), null);
      if (!(t && (TERMINAL.includes(t.phase) || taskOnBase(root, ref, id))))
        throw new DeliveryError(`You are on ${cur}, the branch of ${id}, which has not been merged. Finish it, or cancel it, first.`);
    } else if (cur.startsWith(UPDATE_BRANCH_PREFIX)) {
      if (!updateOnBase(root, ref))
        throw new DeliveryError(`The team update on ${cur} is waiting for the owner to press Merge on GitHub${st.pending_update && st.pending_update.pr ? `: ${st.pending_update.pr}` : ''}. Nothing new starts before it.`);
    } else return { base: cur, toClose: [] }; // the owner's own branch: work starts from it, as before
    tail = takeLedgerTail(root);
    git(['checkout', '-q', base], root);
  }
  if (ref !== base && git(['merge', '--ff-only', '--quiet', ref], root, { allowFail: true }) === null)
    throw new DeliveryError(`Your local ${base} has commits that are not on GitHub, so it cannot be updated safely. Push them through a pull request (or reset ${base} to origin/${base}), then try again.`);
  if (tail) appendFileSync(join(root, LEDGER), tail, 'utf8');
  const toClose = mergedTasksOnBase(root);
  const next = { ...(readState(root) || {}) };
  const activeClosed = next.active_task && (toClose.includes(next.active_task) || TERMINAL.includes((readJSON(join(taskDir(root, next.active_task), 'task.json'), {}) || {}).phase));
  if (activeClosed) {
    next.last_task = next.active_task;
    next.active_task = null;
  }
  delete next.pr;
  if (next.pending_update && cur && cur.startsWith(UPDATE_BRANCH_PREFIX)) delete next.pending_update;
  if (activeClosed || cur !== base) writeState(root, next);
  return { base, toClose };
}

// The paths a closure changed, to be committed on the next branch (the base branch itself is protected).
export function closurePaths(closed) {
  return [...closed.map((c) => taskRel(c.id)), LEDGER];
}

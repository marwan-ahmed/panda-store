#!/usr/bin/env node
// Marwan SAT — verify: the deterministic gate (charter §4.4, §8).
//
//   node .team/bin/verify.mjs                      # local run, active task (if any)
//   node .team/bin/verify.mjs --ci --base origin/main --out sat-evidence
//   node .team/bin/verify.mjs --skip install,build # skip steps (recorded as skipped)
//
// Writes raw logs + summary.json. Only this tool writes evidence. Exit code 0 = pass.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { COMMAND_ORDER, findRoot, loadProject } from './lib/config.mjs';
import { changedSince, effectiveBase, headSha, isGitRepo, mergeBase, porcelainFiles } from './lib/git.mjs';
import { matchAny, parsePathList, toPosix } from './lib/glob.mjs';
import { commandExists, firstToken, runShell, sha256File } from './lib/proc.mjs';
import { judgeDependencies, scopeScannerCommand } from './lib/scan.mjs';
import { allowedWriteOf, FIXED_PROTECTED, readLock, readTasksJson } from './lib/scope.mjs';
import { activeTask, appendLedger, readTask, taskDir, taskRel, writeTask } from './lib/state.mjs';

const TOOL_FILES = ['.team/LEDGER.jsonl'];

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    opts[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return opts;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

// Files written by SAT tools themselves (phase/verify/report). The guard keeps agents out of them.
function isToolFile(rel) {
  return TOOL_FILES.includes(rel) || /^\.team\/tasks\/[^/]+\/(task\.json|REVIEW\.c\d+\.json|SECURITY_AUDIT\.c\d+\.json)$/.test(rel);
}

function ciTask(root, base) {
  const mb = mergeBase(base, 'HEAD', root) || base;
  const changed = changedSince(mb, root);
  const ids = [...new Set(changed.map((f) => (/^\.team\/tasks\/(TASK-\d+)\//.exec(f) || [])[1]).filter(Boolean))];
  return { ids, changed, mergeBaseSha: mb };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = findRoot();
  if (!root) throw new Error('Could not find .team/project.yaml');
  const cfg = loadProject(root);
  const ci = Boolean(opts.ci) || process.env.CI === 'true';
  const skip = new Set(typeof opts.skip === 'string' ? opts.skip.split(',').map((s) => s.trim()) : []);
  const timeoutMs = cfg.timeouts.step_minutes * 60 * 1000;
  if (!isGitRepo(root)) throw new Error('The project is not a git repository.');

  // Which task are we verifying?
  let task = null;
  let ciInfo = null;
  if (ci && opts.base) {
    ciInfo = ciTask(root, opts.base);
    if (ciInfo.ids.length === 1 && existsSync(join(taskDir(root, ciInfo.ids[0]), 'task.json'))) task = readTask(root, ciInfo.ids[0]);
  } else {
    task = activeTask(root);
  }

  const sha = headSha(root);
  const dirtyFiles = porcelainFiles(root).filter((f) => !isToolFile(f));

  // The commit this change is measured from (charter §9.6): in CI the merge base with the PR's base branch;
  // locally the task's base (or the merge base with the base branch once it was merged into the task branch).
  // An audit is about the debt already in the repository: its scanners look at everything, and what they
  // report is input for the security lens to triage (charter §5.5), not a reason for the run to fail.
  const isAudit = Boolean(task && task.kind === 'audit');
  const scanScope = isAudit ? 'full' : cfg.security.scan_scope;
  const base = ciInfo ? ciInfo.mergeBaseSha : effectiveBase(root, cfg.git.base_branch, task && task.base_sha);
  const changedFromBase = base ? changedSince(base, root).filter((f) => !isToolFile(f)) : [];
  const runDir = typeof opts.out === 'string' ? join(root, opts.out) : task ? join(taskDir(root, task.id), 'evidence', `${stamp()}-${(sha || 'nosha').slice(0, 7)}`) : join(root, '.team', 'evidence', `${stamp()}-${(sha || 'nosha').slice(0, 7)}`);
  mkdirSync(runDir, { recursive: true });

  const summary = {
    tool: 'marwan-sat/verify',
    task: task ? task.id : null,
    kind: task ? task.kind || 'change' : null,
    phase: task ? task.phase : null,
    sha,
    dirty: dirtyFiles.length > 0,
    ci,
    scan_scope: scanScope,
    base: base || null,
    started_at: new Date().toISOString(),
    steps: [],
    checks: [],
    result: 'pass',
  };

  const record = (step) => {
    summary.steps.push(step);
    const mark = { pass: '✓', fail: '✗', skipped: '–', missing: '!', warn: '!', not_configured: '–' }[step.status] || '?';
    console.log(`[SAT] ${mark} ${step.name}: ${step.status}${step.exit_code !== undefined ? ` (exit ${step.exit_code})` : ''}`);
    if (step.status === 'fail') summary.result = 'fail';
  };

  const writeLog = (name, command, r) => {
    const log = join(runDir, `${name}.log`);
    writeFileSync(log, `$ ${command}\n# exit: ${r.exitCode}${r.timedOut ? ' (timeout)' : ''}\n# duration_ms: ${r.durationMs}\n\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}\n`, 'utf8');
    return toPosix(relative(root, log));
  };

  const runStep = (name, command, kind) => {
    if (skip.has(name)) return record({ name, kind, command, status: 'skipped', reason: '--skip' });
    if (!command) return record({ name, kind, command: null, status: 'not_configured' });
    const bin = firstToken(command);
    if (kind === 'scanner' && !commandExists(bin)) {
      const required = ci || cfg.security.require_scanners;
      return record({ name, kind, command, status: required ? 'fail' : 'missing', reason: `${bin} is not installed` });
    }
    // Scanners look only at the change (charter §9.6), unless scan_scope is "full" or there is no base.
    const diffScope = kind === 'scanner' && scanScope === 'diff' && Boolean(base);
    let cmd = command;
    const scope = diffScope ? { scope: 'diff', base: base.slice(0, 10) } : kind === 'scanner' ? { scope: 'full' } : {};
    if (diffScope && name !== 'dependencies') {
      const s = scopeScannerCommand(name, command, base);
      cmd = s.command;
      if (!s.scoped) scope.scope = 'full';
      if (s.needsClean && dirtyFiles.length) {
        return record({ name, kind, command: cmd, ...scope, status: 'warn', reason: 'not run: a baseline scan needs a clean working tree. Commit, then run verify again (a dirty run is not evidence anyway)' });
      }
    }
    const r = runShell(cmd, { cwd: root, timeoutMs });
    const log = writeLog(name, cmd, r);
    const step = { name, kind, command: cmd, ...scope, status: r.exitCode === 0 ? 'pass' : 'fail', exit_code: r.exitCode, duration_ms: r.durationMs, log };
    if (isAudit && kind === 'scanner' && r.exitCode !== 0) {
      step.status = 'warn';
      step.audit_input = true;
      step.reason = 'audit input: triage it in findings/security.json (scanner_triage)';
    }
    if (diffScope && name === 'dependencies' && r.exitCode !== 0) {
      const j = judgeDependencies({ root, base, command, changed: changedFromBase, primary: r, timeoutMs, logDir: runDir });
      step.status = j.status;
      if (j.reason) step.reason = j.reason;
      if (j.preexisting) step.preexisting = true;
      if (j.added) step.added = j.added;
      if (j.logs) step.extra_logs = Object.values(j.logs).map((p) => toPosix(relative(root, p)));
    }
    return record(step);
  };

  // 1) Project commands.
  for (const name of COMMAND_ORDER) runStep(name, cfg.commands[name], 'command');
  (cfg.commands.extra || []).forEach((c, i) => runStep(`extra_${i + 1}`, c, 'command'));

  // 2) Security scanners.
  runStep('secrets', cfg.security.scanners.secrets, 'scanner');
  runStep('sast', cfg.security.scanners.sast, 'scanner');
  runStep('dependencies', cfg.security.scanners.dependencies, 'scanner');
  for (const s of summary.steps.filter((x) => x.status === 'warn')) console.log(`[SAT]   ${s.name}: ${s.reason}`);
  if (isAudit) console.log('[SAT]   audit task: scanners checked the whole repository; their findings are inputs, not failures.');
  for (const s of summary.steps.filter((x) => x.kind === 'scanner' && x.status === 'fail' && x.reason)) console.log(`[SAT]   ${s.name}: ${s.reason}`);

  const check = (name, ok, details) => {
    summary.checks.push({ name, status: ok ? 'pass' : 'fail', details });
    console.log(`[SAT] ${ok ? '✓' : '✗'} check:${name}${ok ? '' : ` — ${Array.isArray(details) ? details.slice(0, 10).join(', ') : details}`}`);
    if (!ok) summary.result = 'fail';
  };

  // 3) Managed files untouched (sat.lock checksums).
  const lock = readLock(root);
  if (lock) {
    const modified = Object.entries(lock.managed || {})
      .filter(([rel, hash]) => !existsSync(join(root, rel)) || sha256File(join(root, rel)) !== hash)
      .map(([rel]) => rel);
    check('managed_files', modified.length === 0, modified.length ? modified : 'unchanged');
  } else check('managed_files', false, 'sat.lock is missing');

  // 4) Task-scoped integrity.
  if (task && isAudit) {
    // An audit reads the project; it writes only its own task folder (charter §5.5).
    const T = taskRel(task.id);
    const sinceBase = changedSince(base || task.base_sha, root).filter((f) => !isToolFile(f));
    const outside = sinceBase.filter((f) => !f.startsWith(`${T}/`));
    check('audit_read_only', outside.length === 0, outside.length ? outside : `only ${T}/ changed`);
  } else if (task) {
    const T = taskRel(task.id);
    // What this task changed: since the test freeze (if any), minus whatever came in from the base branch.
    const taskBase = base || task.base_sha;
    const sinceBase = base ? changedFromBase : changedSince(taskBase, root).filter((f) => !isToolFile(f));
    let changed = sinceBase;
    if (task.frozen_sha) {
      const sinceFrozen = new Set(changedSince(task.frozen_sha, root));
      changed = sinceBase.filter((f) => sinceFrozen.has(f));
    }
    const inScopePhases = ['IMPLEMENT', 'FIX', 'REVIEW', 'REPORT', 'GATE_2', 'CLOSED'];
    if (task.frozen_sha && inScopePhases.includes(task.phase)) {
      const touched = changed.filter((f) => matchAny(f, cfg.paths.tests));
      check('tests_frozen', touched.length === 0, touched.length ? touched : `unchanged since ${task.frozen_sha.slice(0, 7)}`);
    }
    if (inScopePhases.includes(task.phase)) {
      const allowed = [...allowedWriteOf(readTasksJson(root, task)), `${T}/**`, '.team/DECISIONS.md'];
      const outside = changed.filter((f) => !matchAny(f, allowed) || matchAny(f, FIXED_PROTECTED));
      check('allowed_write', outside.length === 0, outside.length ? outside : 'all changes within allowed_write');
    }
    if (task.path === 'light') {
      const list = existsSync(join(root, '.team', 'sensitive-paths.txt')) ? parsePathList(readFileSync(join(root, '.team', 'sensitive-paths.txt'), 'utf8')) : { globs: [], contentRules: [] };
      const globs = [...list.globs, ...(cfg.paths.sensitive_extra || [])];
      const candidates = changed.filter((f) => !f.startsWith(`${T}/`));
      const hits = candidates.filter((f) => matchAny(f, globs));
      for (const f of candidates) {
        if (hits.includes(f) || !existsSync(join(root, f))) continue;
        const text = readFileSync(join(root, f), 'utf8');
        if (list.contentRules.some((rx) => rx.test(text))) hits.push(f);
      }
      check('light_path_sensitive', hits.length === 0, hits.length ? hits.map((h) => `${h} (requires the full path)`) : 'no sensitive paths');
    }
  } else if (ciInfo && ciInfo.ids.length > 1) {
    check('single_task_per_pr', false, `The PR contains more than one task: ${ciInfo.ids.join(', ')}`);
  }

  summary.finished_at = new Date().toISOString();
  writeFileSync(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const rel = toPosix(relative(root, runDir));
  console.log(`[SAT] Result: ${summary.result === 'pass' ? 'PASS' : 'FAIL'} — evidence in ${rel}`);
  if (summary.dirty) console.log('[SAT] ! The working tree is not clean: this run cannot serve as evidence for moving to the next phase.');

  // 5) Record on the task (local runs only).
  if (task && !ci) {
    task.last_verify = { sha, dirty: summary.dirty, result: summary.result, dir: rel, at: summary.finished_at };
    if (['IMPLEMENT', 'FIX'].includes(task.phase)) {
      task.verify_failures = summary.result === 'pass' ? 0 : (task.verify_failures || 0) + 1;
    }
    writeTask(root, task);
    appendLedger(root, { type: 'verify', task: task.id, phase: task.phase, sha, result: summary.result, dir: rel });
    const limit = cfg.limits.verify_failures + ((task.granted && task.granted.verify_failures) || 0);
    if (['IMPLEMENT', 'FIX'].includes(task.phase) && task.verify_failures >= limit) {
      console.log(`[SAT] ✗ The task hit the limit of consecutive failures (${limit}). It stops and goes to the owner.`);
      const fresh = readTask(root, task.id);
      fresh.escalated_from = fresh.phase;
      fresh.phase = 'ESCALATED';
      fresh.history = [...(fresh.history || []), { phase: 'ESCALATED', at: new Date().toISOString(), from: task.phase, reason: 'verify_failures limit' }];
      writeTask(root, fresh);
      writeFileSync(join(root, '.team', 'STATE.json'), `${JSON.stringify({ active_task: task.id, phase: 'ESCALATED', updated_at: new Date().toISOString() }, null, 2)}\n`);
      appendLedger(root, { type: 'phase', task: task.id, from: task.phase, to: 'ESCALATED', reason: 'verify_failures limit' });
    }
  }
  process.exit(summary.result === 'pass' ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(`[SAT] ✗ ${e.message}`);
  process.exit(1);
}

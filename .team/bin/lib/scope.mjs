// Marwan SAT — who may write what, in which phase.
// Used by guard.mjs (before a write) and by verify.mjs (after the fact, on the diff).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchAny, toPosix } from './glob.mjs';
import { taskRel } from './state.mjs';

// Files that only SAT tools may write, whatever the phase.
export const FIXED_PROTECTED = [
  '.team/STATE.json',
  '.team/LEDGER.jsonl',
  '.team/sat.lock',
  '.team/tasks/*/task.json',
  '.team/tasks/*/evidence/**',
  '.team/tasks/*/REVIEW.c*.json',
  '.team/tasks/*/SECURITY_AUDIT.c*.json',
  '.team/tasks/*/BACKLOG.json',
  '.team/tasks/*/requests/**',
  '.team/evidence/**',
  '.git/**',
];

export function readLock(root) {
  const p = join(root, '.team', 'sat.lock');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function protectedGlobs(root) {
  const lock = readLock(root);
  const extra = lock ? [...Object.keys(lock.managed || {}), ...Object.keys(lock.generated || {})] : ['.team/bin/**', '.team/roles/**', '.team/templates/**', '.team/schemas/**', '.team/CHARTER.md', '.agents/**'];
  return [...FIXED_PROTECTED, ...extra];
}

export function readTasksJson(root, task) {
  const p = join(root, taskRel(task.id), 'TASKS.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function allowedWriteOf(tasksJson) {
  if (!tasksJson || !Array.isArray(tasksJson.items)) return [];
  return tasksJson.items.flatMap((it) => (Array.isArray(it.allowed_write) ? it.allowed_write : []));
}

// Globs the agents may write during a phase (relative to the repo root).
export function phaseWritable(phase, task, cfg, tasksJson) {
  const T = taskRel(task.id);
  switch (phase) {
    case 'INTAKE':
      return [`${T}/REQUEST.md`];
    case 'INTERPRET':
      return task.path === 'light' ? [`${T}/EXEC_PROMPT.md`, `${T}/TASKS.json`] : [`${T}/EXEC_PROMPT.md`];
    case 'GATE_0':
      return [`${T}/ANSWERS.md`];
    case 'DESIGN':
      return [`${T}/SPEC.md`, `${T}/ARCH.md`, `${T}/PLAN.md`, '.team/DECISIONS.md', `${T}/CHANGE_DECISION-*.md`];
    case 'THREAT':
      return [`${T}/THREAT_MODEL.md`];
    case 'GATE_1':
      return [`${T}/TASKS.json`];
    case 'TESTS':
      return [...cfg.paths.tests, `${T}/TRACE.md`];
    case 'IMPLEMENT':
    case 'FIX':
      return [...allowedWriteOf(tasksJson), `${T}/IMPLEMENTATION_NOTES.md`, `${T}/CHANGE_REQUEST-*.md`];
    case 'REVIEW':
      return [`${T}/REVIEW.json`, `${T}/SECURITY_AUDIT.json`, `${T}/review/**`, `${T}/attacks/**`];
    case 'REPORT':
      return [`${T}/REPORT.md`];
    case 'GATE_2':
      return ['.team/DECISIONS.md'];
    // Audit tasks: each lens and each challenger owns one file; proofs are scripts and their output.
    case 'INVENTORY':
      return [`${T}/INVENTORY.json`];
    case 'FINDINGS':
      return [`${T}/findings/security.json`, `${T}/findings/logic-money.json`, `${T}/findings/gaps.json`, `${T}/proofs/**`];
    case 'CHALLENGE':
      return [`${T}/challenge/by-reviewer.json`, `${T}/challenge/by-auditor.json`, `${T}/proofs/**`];
    case 'BACKLOG':
      return [`${T}/BACKLOG.md`];
    default:
      return [];
  }
}

export function isProtected(rel, root) {
  return matchAny(toPosix(rel), protectedGlobs(root));
}

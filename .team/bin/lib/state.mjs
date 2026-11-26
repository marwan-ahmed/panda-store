// Marwan SAT — task state, task records and the append-only ledger.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const PHASES = [
  'INTAKE', 'INTERPRET', 'GATE_0', 'DESIGN', 'THREAT', 'GATE_1', 'GATE_START', 'TESTS',
  'IMPLEMENT', 'REVIEW', 'FIX', 'REPORT', 'GATE_2', 'CLOSED', 'ESCALATED', 'CANCELLED',
  // Audit tasks (charter §5.5): discover and prioritise work; change nothing outside the task folder.
  'INVENTORY', 'FINDINGS', 'CHALLENGE', 'BACKLOG', 'GATE_A',
];
// GATE_1 approves the plan; GATE_START is the separate permission to start changing the project (charter §6).
export const GATES = ['GATE_0', 'GATE_1', 'GATE_START', 'GATE_2', 'GATE_A'];
export const AUDIT_PHASES = ['INVENTORY', 'FINDINGS', 'CHALLENGE', 'BACKLOG', 'GATE_A'];
export const TERMINAL = ['CLOSED', 'CANCELLED'];

export function teamDir(root) {
  return join(root, '.team');
}

export function statePath(root) {
  return join(root, '.team', 'STATE.json');
}

export function taskDir(root, id) {
  return join(root, '.team', 'tasks', id);
}

export function taskRel(id) {
  return `.team/tasks/${id}`;
}

export function readJSON(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJSON(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

export function readState(root) {
  return readJSON(statePath(root), null);
}

export function writeState(root, state) {
  writeJSON(statePath(root), { ...state, updated_at: new Date().toISOString() });
}

export function readTask(root, id) {
  const t = readJSON(join(taskDir(root, id), 'task.json'), null);
  if (!t) throw new Error(`Task ${id} does not exist.`);
  return t;
}

export function writeTask(root, task) {
  writeJSON(join(taskDir(root, task.id), 'task.json'), task);
}

export function activeTask(root) {
  const st = readState(root);
  if (!st || !st.active_task) return null;
  return readTask(root, st.active_task);
}

export function appendLedger(root, event) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  appendFileSync(join(root, '.team', 'LEDGER.jsonl'), `${line}\n`, 'utf8');
}

export function readLedger(root) {
  const p = join(root, '.team', 'LEDGER.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function listTasks(root) {
  const dir = join(root, '.team', 'tasks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^TASK-\d+$/.test(n))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
}

// `taken` adds ids that exist elsewhere (e.g. branches of cancelled, never-merged tasks) so an id is never reused.
export function nextTaskId(root, taken = []) {
  const nums = [...listTasks(root), ...taken].map((id) => Number(String(id).match(/TASK-(\d+)$/)?.[1] || 0));
  const last = nums.length ? Math.max(...nums) : 0;
  return `TASK-${String(last + 1).padStart(3, '0')}`;
}

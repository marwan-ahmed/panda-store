// Marwan SAT — deterministic checks on the team's contracts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './yaml.mjs';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const PROOFS = ['confirmed', 'suspected'];
export const REVIEW_LENSES = ['logic', 'money', 'test_integrity'];
export const COVERAGE = ['TESTED_DYNAMIC', 'REVIEWED_STATIC', 'NOT_TESTED', 'NOT_APPLICABLE'];
export const AUDIT_VERDICTS = ['BLOCKED', 'INCOMPLETE', 'CLEAR_WITHIN_SCOPE'];
export const REVIEW_VERDICTS = ['BLOCKED', 'CLEAR_WITHIN_SCOPE'];
const TOO_BROAD = new Set(['*', '**', '**/*', '.', './', '/', '**/**']);

export function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

export function readJSONFile(path) {
  const txt = readText(path);
  if (txt === null) return { value: null, error: `missing file ${path}` };
  try {
    return { value: JSON.parse(txt), error: null };
  } catch (e) {
    return { value: null, error: `invalid JSON in ${path}: ${e.message}` };
  }
}

export function extractIds(text, prefix) {
  if (!text) return [];
  const rx = new RegExp(`\\b${prefix}-\\d+\\b`, 'g');
  return [...new Set(text.match(rx) || [])].sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
}

// AC definitions are list items that start with the id: "- **AC-3** (← EXEC §2.1, R2): ..."
export function checkSpecTrace(specText) {
  const errors = [];
  const defs = [];
  for (const line of specText.split(/\r?\n/)) {
    const m = /^\s*[-*]\s*\*{0,2}(AC-\d+)\*{0,2}/.exec(line);
    if (!m) continue;
    defs.push(m[1]);
    if (!/(EXEC|R\d+)/.test(line)) errors.push(`${m[1]} does not reference an item in EXEC_PROMPT (add "← EXEC §x" or "R<n>")`);
  }
  if (defs.length === 0) errors.push('SPEC.md has no acceptance criterion in the form "- **AC-1** (← EXEC §..)"');
  return { defs, errors };
}

export function readExecPrompt(dir) {
  const txt = readText(join(dir, 'EXEC_PROMPT.md'));
  if (txt === null) return { error: 'EXEC_PROMPT.md is missing' };
  const { data } = parseFrontmatter(txt);
  if (!data) return { error: 'EXEC_PROMPT.md has no front matter (blocking_questions, sensitive_assumptions, proposed_path)' };
  const bq = data.blocking_questions;
  const sa = data.sensitive_assumptions;
  if (!Number.isInteger(bq) || bq < 0) return { error: 'blocking_questions must be a whole number' };
  if (!Number.isInteger(sa) || sa < 0) return { error: 'sensitive_assumptions must be a whole number' };
  if (!['full', 'light'].includes(data.proposed_path)) return { error: 'proposed_path must be full or light' };
  if (bq > 3) return { error: 'More than 3 blocking questions in one round (turn the rest into stated assumptions)' };
  return { data, text: txt };
}

export function validateTasks(obj, taskId) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return ['TASKS.json: not a JSON object'];
  if (obj.task_id !== taskId) errors.push(`TASKS.json: task_id must be ${taskId}`);
  if (!['full', 'light'].includes(obj.path)) errors.push('TASKS.json: path must be full or light');
  if (!Array.isArray(obj.items) || obj.items.length === 0) errors.push('TASKS.json: items is empty');
  else {
    const ids = new Set();
    obj.items.forEach((it, i) => {
      const where = `TASKS.json items[${i}]`;
      if (!it.id) errors.push(`${where}: id is required`);
      if (ids.has(it.id)) errors.push(`${where}: duplicate id ${it.id}`);
      ids.add(it.id);
      if (!it.title) errors.push(`${where}: title is required`);
      if (!Array.isArray(it.acceptance)) errors.push(`${where}: acceptance must be a list`);
      if (!Array.isArray(it.allowed_write) || it.allowed_write.length === 0) errors.push(`${where}: allowed_write needs at least one path`);
      else
        for (const p of it.allowed_write) {
          if (typeof p !== 'string' || TOO_BROAD.has(p.trim())) errors.push(`${where}: allowed_write pattern is too broad "${p}"`);
          if (typeof p === 'string' && /^\.team\/|^\.agents\/|^\.claude\/|^\.github\/workflows\/sat-/.test(p)) errors.push(`${where}: governance files cannot be listed in allowed_write "${p}"`);
        }
    });
  }
  return errors;
}

function validateFinding(f, i, where, kind) {
  const errors = [];
  const at = `${where} findings[${i}]`;
  for (const k of ['id', 'severity', 'proof', 'location', 'fix']) if (!f[k]) errors.push(`${at}: ${k} is required`);
  if (f.severity && !SEVERITIES.includes(f.severity)) errors.push(`${at}: invalid severity`);
  if (f.proof && !PROOFS.includes(f.proof)) errors.push(`${at}: invalid proof`);
  if (kind === 'review') {
    if (!REVIEW_LENSES.includes(f.lens)) errors.push(`${at}: lens must be ${REVIEW_LENSES.join(' | ')}`);
    if (!f.scenario) errors.push(`${at}: scenario is required`);
    if (f.proof === 'confirmed' && !f.evidence) errors.push(`${at}: confirmed finding without evidence`);
  } else {
    if (!f.axis) errors.push(`${at}: axis is required`);
    if (f.proof === 'confirmed' && !(f.exploit && f.exploit.request && f.exploit.response) && !f.evidence)
      errors.push(`${at}: confirmed finding without exploit.request/response or evidence`);
  }
  return errors;
}

export function isBlocking(f) {
  return f.proof === 'confirmed' && (f.severity === 'critical' || f.severity === 'high');
}

export function validateReview(obj) {
  const errors = [];
  if (!obj) return ['REVIEW.json is missing'];
  if (!REVIEW_VERDICTS.includes(obj.verdict)) errors.push(`REVIEW.json: verdict must be ${REVIEW_VERDICTS.join(' | ')}`);
  if (!Array.isArray(obj.findings)) errors.push('REVIEW.json: findings must be a list');
  else obj.findings.forEach((f, i) => errors.push(...validateFinding(f, i, 'REVIEW.json', 'review')));
  const blocking = (obj.findings || []).some(isBlocking);
  if (blocking && obj.verdict !== 'BLOCKED') errors.push('REVIEW.json: there is a confirmed Critical/High finding but the verdict is not BLOCKED');
  if (!blocking && obj.verdict === 'BLOCKED') errors.push('REVIEW.json: the verdict is BLOCKED without a confirmed Critical/High finding');
  return errors;
}

export function validateAudit(obj) {
  const errors = [];
  if (!obj) return ['SECURITY_AUDIT.json is missing'];
  if (!['web', 'mobile'].includes(obj.profile)) errors.push('SECURITY_AUDIT.json: profile must be web or mobile');
  if (!AUDIT_VERDICTS.includes(obj.verdict)) errors.push(`SECURITY_AUDIT.json: verdict must be ${AUDIT_VERDICTS.join(' | ')}`);
  if (!Array.isArray(obj.coverage) || obj.coverage.length === 0) errors.push('SECURITY_AUDIT.json: coverage is empty');
  else
    obj.coverage.forEach((c, i) => {
      if (!c.axis) errors.push(`SECURITY_AUDIT.json coverage[${i}]: axis is required`);
      if (!COVERAGE.includes(c.status)) errors.push(`SECURITY_AUDIT.json coverage[${i}]: invalid status`);
      if ((c.status === 'NOT_TESTED' || c.status === 'NOT_APPLICABLE') && !c.reason)
        errors.push(`SECURITY_AUDIT.json coverage[${i}]: reason is required with ${c.status}`);
    });
  if (!Array.isArray(obj.findings)) errors.push('SECURITY_AUDIT.json: findings must be a list');
  else obj.findings.forEach((f, i) => errors.push(...validateFinding(f, i, 'SECURITY_AUDIT.json', 'audit')));
  const blocking = (obj.findings || []).some(isBlocking);
  if (blocking && obj.verdict !== 'BLOCKED') errors.push('SECURITY_AUDIT.json: there is a confirmed Critical/High vulnerability but the verdict is not BLOCKED');
  if (!blocking && obj.verdict === 'BLOCKED') errors.push('SECURITY_AUDIT.json: the verdict is BLOCKED without a confirmed Critical/High vulnerability');
  const summary = String(obj.summary || '');
  if (/\b(safe|secure)\b/i.test(summary) || /(^|[^؀-ۿ])آمن([^؀-ۿ]|$)/.test(summary))
    errors.push('SECURITY_AUDIT.json: the summary must not say "safe" (or the Arabic word for it): CLEAR_WITHIN_SCOPE means no vulnerability was proven within what was tested');
  return errors;
}

// Highest-numbered "<prefix>-<n>.md" in a directory, e.g. CHANGE_DECISION-2.md.
export function latestNumbered(dir, prefix) {
  if (!existsSync(dir)) return null;
  const rx = new RegExp(`^${prefix}-(\\d+)\\.md$`);
  const found = readdirSync(dir)
    .map((n) => [n, rx.exec(n)])
    .filter(([, m]) => m)
    .sort((a, b) => Number(a[1][1]) - Number(b[1][1]));
  return found.length ? join(dir, found[found.length - 1][0]) : null;
}

// What the owner must accept in writing before merging a task (charter §7.3, §7.4): every Medium finding,
// every Critical or High that is only suspected (confirmed ones force FIX and never reach Gate 2), and a
// security audit that could not test everything it should have (INCOMPLETE).
export function acceptanceItems(review, audit) {
  const ids = [];
  for (const x of [...((review && review.findings) || []), ...((audit && audit.findings) || [])])
    if (x.severity === 'medium' || (['critical', 'high'].includes(x.severity) && x.proof !== 'confirmed')) ids.push(x.id);
  if (audit && audit.verdict === 'INCOMPLETE') ids.push('SECURITY_AUDIT:INCOMPLETE');
  return ids;
}

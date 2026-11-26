// Marwan SAT — audit mode (charter §5.5, §7.8, templates 12.9–12.12).
//
// An audit task discovers work instead of doing it. It produces findings that obey the same evidence policy
// as a code review, has every finding challenged by a role that did not write it, and turns the surviving
// findings into a backlog with a deterministic tool (backlog.mjs), never by hand:
//
//   INTAKE → INVENTORY → FINDINGS → CHALLENGE → BACKLOG → GATE_A → CLOSED
//
// This module holds the contracts (validators), the priority table and the backlog builder. Pure functions
// where possible, so they can be tested without a project.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COVERAGE, PROOFS, SEVERITIES } from './contracts.mjs';
import { changedSince, effectiveBase, porcelainFiles } from './git.mjs';
import { matchAny, parsePathList, toPosix } from './glob.mjs';
import { labels } from './plain.mjs';
import { taskRel } from './state.mjs';

export const AXES = {
  web: ['access_control', 'authentication', 'injection', 'business_logic', 'mass_assignment_data_exposure', 'resource_abuse_uploads', 'configuration_secrets_supply_chain'],
  mobile: ['storage', 'crypto', 'auth', 'network', 'platform', 'code', 'resilience', 'privacy'],
};
export const FINDING_TYPES = ['vulnerability', 'bug', 'missing_control', 'feature_gap', 'dependency', 'tech_debt'];
export const SOURCES = ['static_review', 'dynamic', 'reproduction', 'scanner', 'external_advisory'];
export const ATTACKERS = ['unauthenticated', 'authenticated', 'privileged', 'internal', 'none'];
export const REACHABILITY = ['reachable', 'unreachable', 'unknown'];
export const ENV_TOPICS = ['runtime', 'hosting', 'database', 'db_driver', 'auth', 'payments', 'storage', 'email', 'other'];
export const REQUIRED_TOPICS = ['runtime', 'hosting', 'database', 'auth'];
export const EP_KINDS = ['route', 'server_action', 'page', 'webhook', 'cron', 'deep_link', 'screen', 'other'];
export const EXPOSURES = ['public', 'authenticated', 'role'];
export const AUTH_MARKERS = ['MISSING', 'UNKNOWN', 'NOT_REQUIRED'];
export const CHECK_VALUES = ['yes', 'no', 'unknown', 'na'];
export const CHALLENGE_CHECKS = ['reachable', 'fix_valid_in_env', 'severity_ok', 'external_claims_verified'];
export const CHALLENGE_VERDICTS = ['upheld', 'disputed', 'duplicate'];
export const TRIAGE = ['finding', 'false_positive', 'not_reachable', 'tool_error'];
export const SCANNER_STEPS = ['secrets', 'sast', 'dependencies'];
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

// Each lens writes one file (one writer per contract); its findings carry the prefix; another role challenges it.
export const LENSES = {
  security: { file: 'findings/security.json', prefix: 'SEC', challenger: 'reviewer', role: 'marwan-sat-security-auditor' },
  logic_money: { file: 'findings/logic-money.json', prefix: 'REV', challenger: 'auditor', role: 'marwan-sat-adversarial-reviewer' },
  gaps: { file: 'findings/gaps.json', prefix: 'GAP', challenger: 'reviewer', role: 'marwan-sat-architect' },
};
export const CHALLENGERS = {
  reviewer: { file: 'challenge/by-reviewer.json', prefix: 'MR', role: 'marwan-sat-adversarial-reviewer' },
  auditor: { file: 'challenge/by-auditor.json', prefix: 'MA', role: 'marwan-sat-security-auditor' },
};
export const INVENTORY_FILE = 'INVENTORY.json';

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const PRI_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isArr = Array.isArray;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AREA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// "file#symbol" — the symbol survives edits; a line number does not (charter §8.2).
// "#(missing)" names something that should exist and does not.
export function isSymbolLocation(loc) {
  if (!isStr(loc)) return false;
  const m = /^([^\s#]+)#(\S+)$/.exec(loc.trim());
  if (!m) return false;
  return !/^L?\d+(?:-L?\d+)?$/i.test(m[2]);
}

function readJson(path) {
  if (!existsSync(path)) return { value: null, error: `missing file ${toPosix(path)}` };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), error: null };
  } catch (e) {
    return { value: null, error: `invalid JSON in ${toPosix(path)}: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------------------------- INVENTORY

export function validateInventory(obj, { taskId } = {}) {
  const errors = [];
  const W = INVENTORY_FILE;
  if (!obj || typeof obj !== 'object') return { errors: [`${W}: not a JSON object`], envIds: new Set(), eps: [], unknowns: [] };
  if (taskId && obj.task_id !== taskId) errors.push(`${W}: task_id must be ${taskId}`);
  const envIds = new Set();
  const unknowns = [];
  if (!isArr(obj.environment) || obj.environment.length === 0) errors.push(`${W}: environment is empty (record the runtime, hosting, database and auth facts with evidence)`);
  else {
    const topics = new Set();
    obj.environment.forEach((e, i) => {
      const at = `${W} environment[${i}]`;
      if (!/^ENV-\d+$/.test(e.id || '')) errors.push(`${at}: id must look like ENV-1`);
      else if (envIds.has(e.id)) errors.push(`${at}: duplicate id ${e.id}`);
      else envIds.add(e.id);
      if (!ENV_TOPICS.includes(e.topic)) errors.push(`${at}: topic must be one of ${ENV_TOPICS.join(', ')}`);
      else topics.add(e.topic);
      if (!isStr(e.fact)) errors.push(`${at}: fact is required`);
      const status = e.status || 'known';
      if (!['known', 'unknown'].includes(status)) errors.push(`${at}: status must be known or unknown`);
      if (status === 'known' && !isStr(e.evidence)) errors.push(`${at}: a known fact needs evidence (file#symbol, a config file or a command and its output)`);
      if (status === 'unknown') {
        if (!isStr(e.question)) errors.push(`${at}: an unknown fact needs the question that would settle it`);
        else unknowns.push({ id: e.id, topic: e.topic, question: e.question });
      }
    });
    for (const t of REQUIRED_TOPICS) if (!topics.has(t)) errors.push(`${W}: no environment fact with topic "${t}" (a fix that depends on it cannot be judged; write "none" with evidence if there is none)`);
  }
  const eps = [];
  if (!isArr(obj.entry_points) || obj.entry_points.length === 0) errors.push(`${W}: entry_points is empty (every route, server action, webhook, deep link or screen an attacker can reach)`);
  else {
    const ids = new Set();
    obj.entry_points.forEach((p, i) => {
      const at = `${W} entry_points[${i}]`;
      if (!/^EP-\d+$/.test(p.id || '')) errors.push(`${at}: id must look like EP-1`);
      else if (ids.has(p.id)) errors.push(`${at}: duplicate id ${p.id}`);
      else ids.add(p.id);
      if (!EP_KINDS.includes(p.kind)) errors.push(`${at}: kind must be one of ${EP_KINDS.join(', ')}`);
      if (!isStr(p.path)) errors.push(`${at}: path is required (route path, or file#symbol for a server action)`);
      if (!EXPOSURES.includes(p.exposure)) errors.push(`${at}: exposure must be one of ${EXPOSURES.join(', ')}`);
      if (!isStr(p.auth_check)) errors.push(`${at}: auth_check is required: file#symbol of the server-side check, or ${AUTH_MARKERS.join(' / ')}`);
      else if (!AUTH_MARKERS.includes(p.auth_check) && !isSymbolLocation(p.auth_check)) errors.push(`${at}: auth_check must be file#symbol (not a line number) or ${AUTH_MARKERS.join(' / ')}`);
      if (p.exposure !== 'public' && p.auth_check === 'NOT_REQUIRED') errors.push(`${at}: a non-public entry point cannot have auth_check NOT_REQUIRED`);
      if (p.exposure === 'role' && (!isArr(p.roles) || p.roles.length === 0)) errors.push(`${at}: exposure "role" needs the roles allowed to call it`);
      eps.push(p);
    });
  }
  if (obj.money_flows !== undefined) {
    if (!isArr(obj.money_flows)) errors.push(`${W}: money_flows must be a list`);
    else
      obj.money_flows.forEach((m, i) => {
        if (!/^MF-\d+$/.test(m.id || '')) errors.push(`${W} money_flows[${i}]: id must look like MF-1`);
        if (!isStr(m.description)) errors.push(`${W} money_flows[${i}]: description is required`);
      });
  }
  return { errors, envIds, eps, unknowns };
}

// Entry points that are not public and whose server-side check is missing or unknown. Each must be
// examined by at least one security finding (charter §5.5): this is how "do the admin server actions
// check the role themselves?" stops being a question nobody asked.
export function unguardedEntryPoints(eps) {
  return eps.filter((p) => p.exposure !== 'public' && (p.auth_check === 'MISSING' || p.auth_check === 'UNKNOWN'));
}

// ---------------------------------------------------------------------------------------------- FINDINGS

export function validateFinding(f, { prefix, where, envIds = new Set(), epIds = new Set(), root = null, taskDirRel = null, requirePlain = false }) {
  const errors = [];
  const at = `${where} ${f && f.id ? f.id : 'finding'}`;
  if (!f || typeof f !== 'object') return [`${where}: a finding is not an object`];
  if (!new RegExp(`^${prefix}-\\d+$`).test(f.id || '')) errors.push(`${at}: id must look like ${prefix}-1`);
  for (const k of ['title', 'problem', 'expected_behavior']) if (!isStr(f[k])) errors.push(`${at}: ${k} is required`);
  if (requirePlain && !isStr(f.plain)) errors.push(`${at}: plain is required (owner.audience is simple): one sentence a non-programmer understands — what could happen, to whom`);
  if (!FINDING_TYPES.includes(f.type)) errors.push(`${at}: type must be one of ${FINDING_TYPES.join(', ')}`);
  if (!AREA.test(f.area || '')) errors.push(`${at}: area must be kebab-case (it groups findings into tasks), e.g. "authz" or "db-layer"`);
  if (!SEVERITIES.includes(f.severity)) errors.push(`${at}: severity must be one of ${SEVERITIES.join(', ')} (charter §7.1)`);
  if (!PROOFS.includes(f.proof)) errors.push(`${at}: proof must be confirmed or suspected`);
  if (!SOURCES.includes(f.source)) errors.push(`${at}: source must be one of ${SOURCES.join(', ')}`);
  if (!isSymbolLocation(f.location)) errors.push(`${at}: location must be file#symbol, not a line number (lines move; symbols survive)`);
  if (!isArr(f.files) || f.files.length === 0 || !f.files.every(isStr)) errors.push(`${at}: files must list the files a fix would touch`);
  if (f.proof === 'confirmed') {
    if (!isStr(f.evidence)) errors.push(`${at}: a confirmed finding needs evidence (a proof script and its output under proofs/, or a verify log)`);
    else if (taskDirRel && !toPosix(f.evidence).startsWith(`${taskDirRel}/`)) errors.push(`${at}: evidence must be a file of this audit task (${taskDirRel}/proofs/… or ${taskDirRel}/evidence/…)`);
    else if (root && !existsSync(join(root, f.evidence))) errors.push(`${at}: evidence file not found: ${f.evidence}`);
  }
  if (f.proof === 'suspected' && ['critical', 'high'].includes(f.severity) && !isStr(f.to_confirm))
    errors.push(`${at}: a suspected ${f.severity} finding needs to_confirm: the exact check that would confirm or refute it`);
  if (f.reachability !== undefined && !REACHABILITY.includes(f.reachability)) errors.push(`${at}: reachability must be one of ${REACHABILITY.join(', ')}`);
  if (['vulnerability', 'dependency'].includes(f.type) && f.reachability === undefined) errors.push(`${at}: reachability is required for a ${f.type}: can an attacker reach the vulnerable code in this project?`);
  if (f.reachability === 'unreachable' && !isStr(f.reachability_note)) errors.push(`${at}: an unreachable finding needs reachability_note (why the code path is not reachable)`);
  if (f.type === 'vulnerability' && !ATTACKERS.includes(f.attacker)) errors.push(`${at}: attacker must be one of ${ATTACKERS.join(', ')}`);
  else if (f.attacker !== undefined && !ATTACKERS.includes(f.attacker)) errors.push(`${at}: attacker must be one of ${ATTACKERS.join(', ')}`);
  if (f.type === 'dependency') {
    if (!isStr(f.package)) errors.push(`${at}: package is required for a dependency finding (one package, or packages that must move together)`);
    if (!isArr(f.usage)) errors.push(`${at}: usage must list where the package is used (file#symbol), or be [] if no use was found`);
    else if (f.usage.length === 0 && f.reachability === 'reachable') errors.push(`${at}: reachable but no usage site is listed`);
  }
  if (f.entry_points !== undefined) {
    if (!isArr(f.entry_points)) errors.push(`${at}: entry_points must be a list of EP ids`);
    else for (const ep of f.entry_points) if (!epIds.has(ep)) errors.push(`${at}: unknown entry point ${ep} (not in INVENTORY.json)`);
  }
  if (f.fix_hint !== undefined && f.fix_hint !== null) {
    if (!isStr(f.fix_hint)) errors.push(`${at}: fix_hint must be text`);
    if (!isArr(f.fix_assumes)) errors.push(`${at}: a fix_hint needs fix_assumes: the INVENTORY facts (ENV ids) the fix is only correct under ([] if none)`);
    else for (const e of f.fix_assumes) if (!envIds.has(e)) errors.push(`${at}: fix_assumes refers to unknown fact ${e}`);
  }
  if (f.external_claims !== undefined) {
    if (!isArr(f.external_claims)) errors.push(`${at}: external_claims must be a list`);
    else
      f.external_claims.forEach((c, i) => {
        if (!isStr(c && c.claim) || !isStr(c && c.source) || !DATE.test((c && c.checked_at) || ''))
          errors.push(`${at}: external_claims[${i}] needs claim, source (URL or command) and checked_at (YYYY-MM-DD)`);
      });
  }
  for (const k of ['compensating_controls', 'blocked_by']) if (f[k] !== undefined && !(isArr(f[k]) && f[k].every(isStr))) errors.push(`${at}: ${k} must be a list of strings`);
  if (f.decision_needed !== undefined && f.decision_needed !== null && !isStr(f.decision_needed)) errors.push(`${at}: decision_needed must be text`);
  if (f.isolate !== undefined && typeof f.isolate !== 'boolean') errors.push(`${at}: isolate must be true or false`);
  return errors;
}

export function validateFindingsFile(lens, obj, ctx) {
  const L = LENSES[lens];
  const W = L.file;
  const errors = [];
  if (!obj || typeof obj !== 'object') return [`${W}: not a JSON object`];
  if (ctx.taskId && obj.task_id !== ctx.taskId) errors.push(`${W}: task_id must be ${ctx.taskId}`);
  if (obj.lens !== lens) errors.push(`${W}: lens must be "${lens}"`);
  if (!isArr(obj.examined) || obj.examined.length === 0 || !obj.examined.every(isStr)) errors.push(`${W}: examined must list what was actually looked at`);
  if (!isArr(obj.not_examined)) errors.push(`${W}: not_examined must be a list (it may be empty) of { what, reason }`);
  else obj.not_examined.forEach((n, i) => {
    if (!isStr(n && n.what) || !isStr(n && n.reason)) errors.push(`${W} not_examined[${i}]: what and reason are required`);
  });
  if (lens === 'security') {
    const axes = AXES[ctx.profile] || AXES.web;
    if (obj.profile !== ctx.profile) errors.push(`${W}: profile must be ${ctx.profile} (security.profile in project.yaml)`);
    if (!isArr(obj.coverage)) errors.push(`${W}: coverage is required, one entry per axis`);
    else {
      const seen = new Set();
      obj.coverage.forEach((c, i) => {
        if (!axes.includes(c.axis)) errors.push(`${W} coverage[${i}]: unknown axis ${c.axis}`);
        else if (seen.has(c.axis)) errors.push(`${W} coverage[${i}]: axis ${c.axis} listed twice`);
        else seen.add(c.axis);
        if (!COVERAGE.includes(c.status)) errors.push(`${W} coverage[${i}]: invalid status`);
        if ((c.status === 'NOT_TESTED' || c.status === 'NOT_APPLICABLE') && !isStr(c.reason)) errors.push(`${W} coverage[${i}]: reason is required with ${c.status}`);
      });
      for (const a of axes) if (!seen.has(a)) errors.push(`${W}: coverage is missing axis ${a}`);
    }
    if (obj.entry_points_examined !== undefined) {
      if (!isArr(obj.entry_points_examined)) errors.push(`${W}: entry_points_examined must be a list of { id, auth_check, note }`);
      else
        obj.entry_points_examined.forEach((e, i) => {
          const at = `${W} entry_points_examined[${i}]`;
          if (!e || !ctx.epIds.has(e.id)) errors.push(`${at}: unknown entry point ${e && e.id}`);
          if (!e || !isSymbolLocation(e.auth_check)) errors.push(`${at}: auth_check must be the file#symbol of the server-side check you found`);
          if (!e || !isStr(e.note)) errors.push(`${at}: note is required (what the check verifies: session, role, ownership)`);
        });
    }
    if (!isArr(obj.scanner_triage)) errors.push(`${W}: scanner_triage must be a list`);
    else
      obj.scanner_triage.forEach((t, i) => {
        const at = `${W} scanner_triage[${i}]`;
        if (!SCANNER_STEPS.includes(t.step)) errors.push(`${at}: step must be one of ${SCANNER_STEPS.join(', ')} (the verify step)`);
        if (!TRIAGE.includes(t.classification)) errors.push(`${at}: classification must be one of ${TRIAGE.join(', ')}`);
        if (!isStr(t.reason)) errors.push(`${at}: reason is required`);
        if (t.classification === 'finding' && !isStr(t.finding)) errors.push(`${at}: classification "finding" needs the finding id`);
      });
  }
  if (!isArr(obj.findings)) errors.push(`${W}: findings must be a list (it may be empty)`);
  else obj.findings.forEach((f) => errors.push(...validateFinding(f, { ...ctx, prefix: L.prefix, where: W })));
  return errors;
}

export function validateChallengeFile(who, obj, { taskId, assigned, allIds, ...ctx }) {
  const C = CHALLENGERS[who];
  const W = C.file;
  const errors = [];
  if (!obj || typeof obj !== 'object') return [`${W}: not a JSON object`];
  if (taskId && obj.task_id !== taskId) errors.push(`${W}: task_id must be ${taskId}`);
  if (obj.challenger !== who) errors.push(`${W}: challenger must be "${who}"`);
  const missedIds = new Set();
  if (!isArr(obj.missed)) errors.push(`${W}: missed must be a list (it may be empty) of findings the original lenses did not report`);
  else
    obj.missed.forEach((f) => {
      errors.push(...validateFinding(f, { ...ctx, prefix: C.prefix, where: `${W} missed` }));
      if (f && f.id) missedIds.add(f.id);
    });
  const known = new Set([...allIds, ...missedIds]);
  const reviewed = new Map();
  if (!isArr(obj.reviews)) errors.push(`${W}: reviews must be a list`);
  else
    obj.reviews.forEach((r, i) => {
      const at = `${W} reviews[${i}]`;
      if (!assigned.includes(r.finding)) {
        errors.push(`${at}: ${r.finding} is not assigned to the ${who} (a role never challenges its own findings)`);
        return;
      }
      if (reviewed.has(r.finding)) errors.push(`${at}: ${r.finding} is reviewed twice`);
      reviewed.set(r.finding, r);
      if (!CHALLENGE_VERDICTS.includes(r.verdict)) errors.push(`${at}: verdict must be one of ${CHALLENGE_VERDICTS.join(', ')}`);
      if (!isStr(r.reason)) errors.push(`${at}: reason is required, also for "upheld"`);
      const checks = r.checks || {};
      for (const k of CHALLENGE_CHECKS) if (!CHECK_VALUES.includes(checks[k])) errors.push(`${at}: checks.${k} must be one of ${CHECK_VALUES.join(', ')}`);
      if (r.proposed_severity !== undefined && !SEVERITIES.includes(r.proposed_severity)) errors.push(`${at}: invalid proposed_severity`);
      if (r.verdict === 'disputed' && !CHALLENGE_CHECKS.some((k) => checks[k] === 'no') && r.proposed_severity === undefined)
        errors.push(`${at}: a dispute needs a failed check ("no") or a proposed_severity`);
      if (r.verdict === 'duplicate' && (!known.has(r.duplicate_of) || r.duplicate_of === r.finding)) errors.push(`${at}: duplicate_of must name another existing finding`);
    });
  const missing = assigned.filter((id) => !reviewed.has(id));
  if (missing.length) errors.push(`${W}: not challenged yet: ${missing.join(', ')}`);
  for (const [k, list] of [['conflicts', obj.conflicts], ['dependencies', obj.dependencies]]) {
    if (list === undefined) continue;
    if (!isArr(list)) {
      errors.push(`${W}: ${k} must be a list`);
      continue;
    }
    list.forEach((x, i) => {
      const at = `${W} ${k}[${i}]`;
      if (k === 'conflicts') {
        if (!isArr(x.findings) || x.findings.length < 2 || !x.findings.every((id) => known.has(id))) errors.push(`${at}: findings must name two or more existing findings`);
        if (!isStr(x.note)) errors.push(`${at}: note is required (what clashes and what must be decided)`);
      } else {
        if (!known.has(x.finding) || !known.has(x.after) || x.finding === x.after) errors.push(`${at}: finding and after must name two different existing findings`);
        if (!isStr(x.reason)) errors.push(`${at}: reason is required`);
      }
    });
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------- phase checks

// An audit changes nothing outside its own task folder: code, tests and configuration stay as they are.
// Changes that came in by merging the base branch (e.g. a SAT update) are not the audit's.
export function auditScopeErrors(root, task, cfg) {
  const T = taskRel(task.id);
  const tool = (f) => f === '.team/LEDGER.jsonl' || f === '.team/STATE.json';
  const base = effectiveBase(root, cfg && cfg.git ? cfg.git.base_branch : null, task.base_sha) || task.base_sha;
  const changed = new Set([...changedSince(base, root), ...porcelainFiles(root)]);
  const outside = [...changed].filter((f) => !tool(f) && !f.startsWith(`${T}/`));
  return outside.length ? [`An audit changes nothing outside ${T}/. Revert these files:\n- ${outside.slice(0, 20).join('\n- ')}`] : [];
}

export function loadAudit(root, task) {
  const dir = join(root, taskRel(task.id));
  const inv = readJson(join(dir, INVENTORY_FILE));
  const findings = {};
  for (const [lens, L] of Object.entries(LENSES)) findings[lens] = readJson(join(dir, L.file));
  const challenges = {};
  for (const [who, C] of Object.entries(CHALLENGERS)) challenges[who] = readJson(join(dir, C.file));
  return { inv, findings, challenges };
}

// Validates the audit contracts up to (and including) a stage: 'inventory' | 'findings' | 'challenge'.
// Returns { errors, data } where data carries what backlog.mjs needs.
export function checkAudit(root, cfg, task, upto) {
  const errors = [];
  const T = taskRel(task.id);
  const { inv, findings, challenges } = loadAudit(root, task);
  const out = { inventory: inv.value, findings: {}, challenges: {}, unknowns: [], unguarded: [] };
  if (inv.error) return { errors: [inv.error], data: out };
  const iv = validateInventory(inv.value, { taskId: task.id });
  errors.push(...iv.errors);
  out.unknowns = iv.unknowns;
  out.unguarded = unguardedEntryPoints(iv.eps);
  if (!task.last_verify) errors.push('Run node .team/bin/verify.mjs once in this audit before leaving INVENTORY: its scanner logs are the evidence the security lens triages.');
  if (upto === 'inventory') return { errors, data: out };

  const ctx = { taskId: task.id, profile: cfg.security.profile, envIds: iv.envIds, epIds: new Set(iv.eps.map((p) => p.id)), root, taskDirRel: T, requirePlain: Boolean(cfg.owner && cfg.owner.audience === 'simple') };
  const allIds = [];
  for (const lens of Object.keys(LENSES)) {
    const r = findings[lens];
    if (r.error) {
      errors.push(r.error);
      continue;
    }
    errors.push(...validateFindingsFile(lens, r.value, ctx));
    out.findings[lens] = r.value;
    for (const f of (r.value && r.value.findings) || []) if (f && f.id) allIds.push(f.id);
  }
  const dup = allIds.filter((id, i) => allIds.indexOf(id) !== i);
  if (dup.length) errors.push(`Finding ids must be unique across the findings files: ${[...new Set(dup)].join(', ')}`);
  const sec = out.findings.security;
  if (sec) {
    const referenced = new Set((sec.findings || []).flatMap((f) => f.entry_points || []));
    const covered = new Set((sec.entry_points_examined || []).filter((e) => e && isSymbolLocation(e.auth_check)).map((e) => e.id));
    const silent = out.unguarded.filter((p) => !referenced.has(p.id) && !covered.has(p.id));
    if (silent.length)
      errors.push(
        `findings/security.json: these non-public entry points have a MISSING or UNKNOWN server-side check in INVENTORY.json and no security finding examines them: ${silent.map((p) => `${p.id} (${p.path})`).join(', ')}. Report a finding for each, or, if you read the code and found the check, record it in entry_points_examined as { id, auth_check: "file#symbol", note }.`,
      );
    const vsum = task.last_verify ? readJson(join(root, task.last_verify.dir, 'summary.json')).value : null;
    const flagged = ((vsum && vsum.steps) || []).filter((s) => s.kind === 'scanner' && Number.isInteger(s.exit_code) && s.exit_code !== 0);
    const triaged = new Set((sec.scanner_triage || []).map((t) => t.step));
    for (const s of flagged) if (!triaged.has(s.name)) errors.push(`findings/security.json: the ${s.name} scanner reported something (${s.log || 'see the verify evidence'}) and scanner_triage has no entry for it`);
    for (const t of sec.scanner_triage || []) if (t.classification === 'finding' && t.finding && !allIds.includes(t.finding)) errors.push(`findings/security.json scanner_triage: unknown finding ${t.finding}`);
  }
  for (const lens of Object.keys(out.findings))
    for (const f of out.findings[lens].findings || []) for (const b of f.blocked_by || []) if (!allIds.includes(b)) errors.push(`${LENSES[lens].file} ${f.id}: blocked_by refers to unknown finding ${b}`);
  if (upto === 'findings') return { errors, data: out };

  for (const who of Object.keys(CHALLENGERS)) {
    const r = challenges[who];
    if (r.error) {
      errors.push(r.error);
      continue;
    }
    const assigned = Object.entries(LENSES)
      .filter(([, L]) => L.challenger === who)
      .flatMap(([lens]) => ((out.findings[lens] && out.findings[lens].findings) || []).map((f) => f.id));
    errors.push(...validateChallengeFile(who, r.value, { ...ctx, assigned, allIds }));
    out.challenges[who] = r.value;
  }
  const missed = Object.values(out.challenges).flatMap((c) => (c && c.missed) || []).map((f) => f.id);
  const dupMissed = [...allIds, ...missed].filter((id, i, a) => a.indexOf(id) !== i);
  if (dupMissed.length) errors.push(`Finding ids must be unique, including challenge "missed" findings: ${[...new Set(dupMissed)].join(', ')}`);
  return { errors, data: out };
}

// ---------------------------------------------------------------------------------------------- priority

// The priority table (charter §7.8). Deterministic: the same findings always give the same backlog.
export function priorityOf(f) {
  const unreachable = f.reachability === 'unreachable';
  if (f.severity === 'critical') return unreachable ? 'P2' : 'P0';
  if (f.severity === 'high') {
    if (unreachable) return 'P2';
    if (f.proof === 'confirmed' && ['unauthenticated', 'authenticated'].includes(f.attacker)) return 'P0';
    return 'P1';
  }
  if (f.severity === 'medium') return unreachable ? 'P3' : 'P2';
  return 'P3';
}

const higherSeverity = (a, b) => (SEV_RANK[a] <= SEV_RANK[b] ? a : b);
const minPriority = (a, b) => (PRI_RANK[a] <= PRI_RANK[b] ? a : b);

function sensitivityOf(root, files, sensitive) {
  const hits = [];
  for (const f of files) {
    if (matchAny(f, sensitive.globs)) {
      hits.push(f);
      continue;
    }
    const p = root ? join(root, f) : null;
    if (p && existsSync(p) && sensitive.contentRules.length) {
      try {
        const text = readFileSync(p, 'utf8');
        if (sensitive.contentRules.some((rx) => rx.test(text))) hits.push(f);
      } catch {
        /* unreadable: treated as not matching */
      }
    }
  }
  return hits;
}

export function loadSensitive(root, cfg) {
  const p = join(root, '.team', 'sensitive-paths.txt');
  const list = existsSync(p) ? parsePathList(readFileSync(p, 'utf8')) : { globs: [], contentRules: [] };
  return { globs: [...list.globs, ...((cfg.paths && cfg.paths.sensitive_extra) || [])], contentRules: list.contentRules };
}

// ---------------------------------------------------------------------------------------------- backlog

// Builds the backlog from validated audit data. Throws on a dependency cycle.
// opts: { root, auditId, sensitive: {globs, contentRules}, limits: {max_findings_per_task, max_files_per_task},
//         agentsMd: bool, verifySummary, profile, attackEnv }
export function buildBacklog(data, opts) {
  const limits = { max_findings_per_task: 3, max_files_per_task: 8, ...(opts.limits || {}) };
  const sensitive = opts.sensitive || { globs: [], contentRules: [] };

  // 1. Every finding, with where it came from.
  const all = [];
  for (const [lens, file] of Object.entries(data.findings)) for (const f of file.findings || []) all.push({ ...f, origin: lens });
  for (const [who, c] of Object.entries(data.challenges)) for (const f of (c && c.missed) || []) all.push({ ...f, origin: `missed:${who}`, unchallenged: true });
  const byId = new Map(all.map((f) => [f.id, f]));
  const reviews = new Map();
  for (const [who, c] of Object.entries(data.challenges)) for (const r of (c && c.reviews) || []) reviews.set(r.finding, { ...r, by: who });

  // 2. Duplicates merge into the finding they duplicate, keeping the higher severity (conservative).
  const target = (id) => {
    const seen = new Set();
    let cur = id;
    while (reviews.get(cur) && reviews.get(cur).verdict === 'duplicate' && byId.has(reviews.get(cur).duplicate_of) && !seen.has(cur)) {
      seen.add(cur);
      cur = reviews.get(cur).duplicate_of;
    }
    return seen.has(cur) ? [...seen].sort()[0] : cur;
  };
  const duplicates = [];
  for (const f of all) {
    const t = target(f.id);
    if (t === f.id) continue;
    const k = byId.get(t);
    k.severity = higherSeverity(k.severity, f.severity);
    k.files = [...new Set([...(k.files || []), ...(f.files || [])])];
    k.entry_points = [...new Set([...(k.entry_points || []), ...(f.entry_points || [])])];
    k.merged = [...(k.merged || []), f.id];
    duplicates.push({ id: f.id, into: t, reason: reviews.get(f.id).reason });
  }
  const merged = new Set(duplicates.map((d) => d.id));
  const kept = all.filter((f) => !merged.has(f.id));
  const ownerOf = (id) => (merged.has(id) ? target(id) : id);

  // 3. Priority per finding; disputes are flagged, never applied: only the owner lowers a severity (charter §7.4).
  const disputed = [];
  for (const f of kept) {
    f.priority = priorityOf(f);
    const r = reviews.get(f.id);
    if (r && r.verdict === 'disputed') {
      const failed = CHALLENGE_CHECKS.filter((k) => r.checks && r.checks[k] === 'no');
      f.disputed = { by: r.by, reason: r.reason, proposed_severity: r.proposed_severity || null, failed_checks: failed };
      disputed.push({ id: f.id, severity: f.severity, title: f.title, plain: f.plain || null, ...f.disputed });
    }
  }

  // 4. Groups: same priority and area; a dependency or an isolated finding is a task of its own.
  const order = [...kept].sort((a, b) => PRI_RANK[a.priority] - PRI_RANK[b.priority] || SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const groups = new Map();
  for (const f of order) {
    const key = f.isolate || f.type === 'dependency' ? `${f.priority}|${f.area}|${f.id}` : `${f.priority}|${f.area}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const items = [];
  for (const list of groups.values()) {
    let cur = null;
    for (const f of list) {
      const files = new Set([...(cur ? cur.files : []), ...f.files]);
      if (!cur || cur.findings.length >= limits.max_findings_per_task || (files.size > limits.max_files_per_task && cur.findings.length > 0)) {
        cur = { key: `k${items.length}`, priority: f.priority, area: f.area, findings: [], files: new Set() };
        items.push(cur);
      }
      cur.findings.push(f);
      for (const x of f.files) cur.files.add(x);
    }
  }

  // 5. Logical dependencies (declared by the authors or by the challengers), conflicts, shared files.
  const itemOf = new Map();
  for (const it of items) for (const f of it.findings) itemOf.set(f.id, it);
  for (const it of items) {
    it.depends = new Map();
    it.conflicts = [];
  }
  const addDep = (fid, afterId, reason) => {
    const a = itemOf.get(ownerOf(fid));
    const b = itemOf.get(ownerOf(afterId));
    if (a && b && a !== b && !a.depends.has(b.key)) a.depends.set(b.key, { reason, via: `${fid} ← ${afterId}` });
  };
  for (const f of kept) for (const b of f.blocked_by || []) addDep(f.id, b, `${f.id} blocked_by ${b}`);
  for (const c of Object.values(data.challenges)) for (const d of (c && c.dependencies) || []) addDep(d.finding, d.after, d.reason);
  const conflicts = [];
  for (const c of Object.values(data.challenges))
    for (const x of (c && c.conflicts) || []) {
      const its = [...new Set(x.findings.map((id) => itemOf.get(ownerOf(id))).filter(Boolean))];
      conflicts.push({ findings: x.findings, note: x.note, items: its });
      for (const a of its) for (const b of its) if (a !== b) a.conflicts.push({ key: b.key, note: x.note });
    }

  // A task inherits the priority of the most urgent task that waits for it.
  const byKey = new Map(items.map((it) => [it.key, it]));
  for (let changed = true, guard = 0; changed && guard < 1000; guard++) {
    changed = false;
    for (const a of items)
      for (const bk of a.depends.keys()) {
        const b = byKey.get(bk);
        const p = minPriority(a.priority, b.priority);
        if (p !== b.priority) {
          b.promoted = { from: b.priority, because: a.key };
          b.priority = p;
          changed = true;
        }
      }
  }

  // 6. Order: dependencies first, then priority, then the grouping order. A cycle is an error.
  const indeg = new Map(items.map((it) => [it.key, it.depends.size]));
  const dependents = new Map(items.map((it) => [it.key, []]));
  for (const a of items) for (const bk of a.depends.keys()) dependents.get(bk).push(a.key);
  const sorted = [];
  const ready = items.filter((it) => indeg.get(it.key) === 0);
  const pick = () => {
    ready.sort((x, y) => PRI_RANK[x.priority] - PRI_RANK[y.priority] || items.indexOf(x) - items.indexOf(y));
    return ready.shift();
  };
  while (ready.length) {
    const it = pick();
    sorted.push(it);
    for (const dk of dependents.get(it.key)) {
      indeg.set(dk, indeg.get(dk) - 1);
      if (indeg.get(dk) === 0) ready.push(byKey.get(dk));
    }
  }
  if (sorted.length !== items.length) {
    const stuck = items.filter((it) => !sorted.includes(it)).map((it) => it.findings.map((f) => f.id).join('+'));
    throw new Error(`The findings' dependencies form a cycle; resolve it in the challenge files: ${stuck.join(' ↔ ')}`);
  }

  // 7. Governance first: project rules before any task (charter §10 — AGENTS.md is an instruction source).
  const result = [];
  let n = 0;
  const nextId = () => `B-${String(++n).padStart(2, '0')}`;
  if (!opts.agentsMd) {
    result.push({
      id: nextId(),
      title: 'إنشاء AGENTS.md بقواعد المشروع وثوابته',
      priority: 'P0',
      path: 'light',
      area: 'governance',
      governance: 'agents_md',
      findings: [],
      files: ['AGENTS.md'],
      depends_on: [],
      conflicts_with: [],
      shares_files_with: [],
      decisions: ['ما ثوابت المال في المشروع: العملة، ووحدة التخزين، وطريقة التقريب، ومن يتحمّل فرق التقريب، وهل يُحذف أي قيد مالي؟'],
      confirm_first: [],
    });
  }
  const idOf = new Map();
  for (const it of sorted) idOf.set(it.key, nextId());
  const govIds = result.map((r) => r.id);
  for (const it of sorted) {
    const fs = it.findings;
    const files = [...it.files].sort();
    const sensitiveHits = sensitivityOf(opts.root, files, sensitive);
    const full = sensitiveHits.length > 0 || fs.some((f) => f.type === 'dependency' || (f.type === 'vulnerability' && ['critical', 'high'].includes(f.severity)));
    const shares = sorted.filter((o) => o !== it && [...o.files].some((x) => it.files.has(x))).map((o) => idOf.get(o.key));
    result.push({
      id: idOf.get(it.key),
      title: fs.length > 1 ? `${fs[0].title} (+${fs.length - 1})` : fs[0].title,
      priority: it.priority,
      path: full ? 'full' : 'light',
      path_reason: full ? (sensitiveHits.length ? `مسارات حساسة: ${sensitiveHits.join(', ')}` : 'تغيير اعتماديات أو ثغرة Critical/High') : 'لا يمس مساراً حساساً',
      area: it.area,
      findings: fs.map((f) => ({ id: f.id, severity: f.severity, proof: f.proof, title: f.title, plain: f.plain || null, origin: f.origin, merged: f.merged || [], disputed: Boolean(f.disputed), unchallenged: Boolean(f.unchallenged) })),
      files,
      depends_on: [...govIds.map((g) => ({ item: g, type: 'governance', reason: 'project rules come first' })), ...[...it.depends.entries()].map(([k, d]) => ({ item: idOf.get(k), type: 'logical', reason: d.reason, via: d.via }))],
      conflicts_with: it.conflicts.map((c) => ({ item: idOf.get(c.key), note: c.note })),
      shares_files_with: shares,
      promoted: it.promoted ? { from: it.promoted.from, because: idOf.get(it.promoted.because) } : null,
      decisions: fs.filter((f) => isStr(f.decision_needed)).map((f) => `${f.id}: ${f.decision_needed}`),
      confirm_first: fs.filter((f) => f.proof === 'suspected' && ['critical', 'high'].includes(f.severity)).map((f) => ({ id: f.id, check: f.to_confirm })),
      _findings: fs,
    });
  }

  // 8. What the owner must do or decide, and what was not examined.
  // Each action in two wordings: plain for the owner's part, technical (with the setting) for the programmer's.
  const ownerActions = [];
  const lbs = labels('simple');
  for (const s of ((opts.verifySummary && opts.verifySummary.steps) || []).filter((x) => x.kind === 'scanner')) {
    if (s.status === 'missing')
      ownerActions.push({
        simple: `ثبّت أداة «${lbs.step(s.name)}» على جهاز التطوير، أو اطلب ذلك من مبرمج. بدونها لا يكتمل الفحص الآلي في أي بند.`,
        developer: `ثبّت الماسح «${s.name}» محلياً (${s.reason || s.command}). بدونه يسجّل verify في كل مهمة أن الماسح «غير مثبت».`,
      });
    if (s.status === 'not_configured')
      ownerActions.push({ simple: `اطلب من مبرمج تفعيل أداة «${lbs.step(s.name)}» في إعدادات الفريق.`, developer: `اضبط security.scanners.${s.name} في project.yaml.` });
  }
  if (opts.profile === 'web' && opts.attackEnv === 'none')
    ownerActions.push({
      simple: 'اطلب من مبرمج تجهيز «بيئة تجربة أمنية» منفصلة ببيانات وهمية، حتى يجرّب المدقق الأمني الهجمات فعلاً بدل الاكتفاء بقراءة الكود.',
      developer: 'اضبط security.attack_env (فرع Neon بالمخطط فقط أو حاوية Postgres) حتى لا يخرج التدقيق الأمني في كل مهمة INCOMPLETE.',
    });
  const notExamined = [];
  for (const [lens, file] of Object.entries(data.findings)) for (const x of file.not_examined || []) notExamined.push({ lens, ...x });
  const sec = data.findings.security;
  const coverageGaps = sec ? (sec.coverage || []).filter((c) => c.status === 'NOT_TESTED').map((c) => ({ axis: c.axis, reason: c.reason })) : [];
  const unchallenged = kept.filter((f) => f.unchallenged).map((f) => ({ id: f.id, by: f.origin.split(':')[1], title: f.title, plain: f.plain || null, severity: f.severity }));
  const stats = {
    findings: all.length,
    kept: kept.length,
    by_severity: Object.fromEntries(SEVERITIES.map((s) => [s, kept.filter((f) => f.severity === s).length])),
    confirmed: kept.filter((f) => f.proof === 'confirmed').length,
    suspected: kept.filter((f) => f.proof === 'suspected').length,
    challenge: Object.fromEntries(CHALLENGE_VERDICTS.map((v) => [v, [...reviews.values()].filter((r) => r.verdict === v).length])),
    tasks: result.length,
  };
  return { items: result, ownerActions, disputed, duplicates, conflicts: conflicts.map((c) => ({ ...c, items: c.items.map((x) => idOf.get(x.key)) })), unchallenged, unknowns: data.unknowns || [], notExamined, coverageGaps, stats, environment: (data.inventory && data.inventory.environment) || [] };
}

// ---------------------------------------------------------------------------------------------- rendering

const SEV = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const PROOF = { confirmed: 'مؤكد', suspected: 'مشتبه' };
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export const FROM_MARKER = (auditId, itemId) => `<!-- sat:from-backlog ${auditId} ${itemId} -->`;

// The draft REQUEST.md of a backlog item: problem, expected behaviour, evidence — and the "how" kept apart
// as non-binding hints, so the architect is not handed a design disguised as a requirement.
export function renderRequest(item, { auditId, environment }) {
  const env = new Map((environment || []).map((e) => [e.id, e]));
  const L = [FROM_MARKER(auditId, item.id), `# ${item.title}`, ''];
  L.push(`> بند ${item.id} من قائمة مهام التدقيق ${auditId} (الأولوية ${item.priority}، المسار ${item.path === 'full' ? 'الكامل' : 'الخفيف'}). اعتمده صاحب القرار في البوابة A.`, '');
  if (item.governance === 'agents_md') {
    L.push('## المطلوب', '- أنشئ `AGENTS.md` في جذر المشروع بقواعده الخاصة: العمارة، وثوابت المال، وسياسة التعامل مع الخدمات الخارجية، وأوامر التحقق.', '- استند إلى حقائق البيئة في INVENTORY.json لهذا التدقيق، ولا تضف قاعدة لم يقرّها صاحب القرار.', '');
    L.push('## قرارات مطلوبة منك', ...item.decisions.map((d) => `- ${d}`), '');
    return `${L.join('\n')}\n`;
  }
  L.push('## المشكلة');
  for (const f of item._findings) {
    L.push(`- **${f.id}** (${SEV[f.severity]}، ${PROOF[f.proof]}): ${f.problem}`);
    if (isStr(f.plain)) L.push(`  - بكلام بسيط: ${f.plain}`);
    L.push(`  - الموقع: \`${f.location}\`${f.evidence ? ` · الدليل: \`${f.evidence}\`` : ''}${f.reachability ? ` · الوصول: ${f.reachability}` : ''}`);
    if (f.compensating_controls && f.compensating_controls.length) L.push(`  - ضوابط تعويضية قائمة: ${f.compensating_controls.join('؛ ')}`);
  }
  L.push('', '## السلوك المتوقع');
  for (const f of item._findings) L.push(`- **${f.id}:** ${f.expected_behavior}`);
  if (item.confirm_first.length) {
    L.push('', '## يجب تأكيده أولاً (قبل التصميم)');
    for (const c of item.confirm_first) L.push(`- **${c.id}:** ${c.check}`);
  }
  if (item.decisions.length) {
    L.push('', '## قرارات مطلوبة منك');
    for (const d of item.decisions) L.push(`- ${d}`);
  }
  const hints = item._findings.filter((f) => isStr(f.fix_hint));
  if (hints.length) {
    L.push('', '## اقتراحات غير ملزمة (للمعماري أن يرفضها)');
    for (const f of hints) {
      const assumes = (f.fix_assumes || []).map((id) => (env.get(id) ? `${id}: ${env.get(id).fact}` : id));
      L.push(`- **${f.id}:** ${f.fix_hint}${assumes.length ? ` — يصح فقط إذا: ${assumes.join('؛ ')}` : ''}`);
    }
  }
  const claims = item._findings.flatMap((f) => (f.external_claims || []).map((c) => ({ ...c, id: f.id })));
  if (claims.length) {
    L.push('', '## ادعاءات خارجية (تُراجع وقت التنفيذ)');
    for (const c of claims) L.push(`- **${c.id}:** ${c.claim} — المصدر: ${c.source} (${c.checked_at})`);
  }
  if (item.conflicts_with.length) {
    L.push('', '## تعارض مع بنود أخرى');
    for (const c of item.conflicts_with) L.push(`- ${c.item}: ${c.note}`);
  }
  return `${L.join('\n')}\n`;
}

export function renderBacklog(b, { auditId, title, head, tmBegin, tmPlaceholder, tmEnd, audience = 'simple', badge = '' }) {
  const lb = labels(audience);
  const WHO = { reviewer: 'المراجع المعادي', auditor: 'المدقق الأمني' };
  const plainOf = (x) => x.plain || x.title;
  const L = [];
  L.push(`# قائمة مهام التدقيق — ${auditId}: ${title}`, '');
  if (badge) L.push(`> ${badge}`, '>');
  L.push('> هذه القائمة جزآن: **الأول لك** لتقرر، **والثاني للمبرمج** (الملفات والأدلة وحقائق البيئة). مولَّدة آلياً بأداة `backlog.mjs`، إلا القسم 5. أي تعديل يدوي على الأقسام المولّدة يُبطلها.', '');

  L.push('# الجزء الأول: لك', '');
  L.push('## 1. القرار المطلوب منك');
  L.push(`- **للاعتماد** اضغط **Merge** في ${lb.simple ? 'طلب الدمج الخاص بهذا التدقيق على GitHub (رابطه في رسالة المدير التقني)' : 'PR هذا التدقيق'}: ضغطتك هي اعتماد القائمة، ولا تحتاج إلى كتابة شيء. **لطلب تعديل:** «عدّل: …». **وللإلغاء:** «ألغِ المهمة».`);
  L.push('- **اعتماد القائمة لا يبدأ أي عمل في برنامجك.** كل بند يُحضَّر لاحقاً حين تطلبه، ثم يمر ببوابتين منفصلتين: «اعتماد الخطة» ثم «إذن البدء».');
  for (const d of b.disputed)
    L.push(`- **نتيجة مختلف عليها** (${d.id}): ${plainOf(d)} — يرى ${WHO[d.by] || d.by}: ${d.reason}${d.proposed_severity ? ` (يقترح «${lb.sev(d.proposed_severity)}» بدل «${lb.sev(d.severity)}»)` : ''}. أنت وحدك تملك تخفيف الدرجة، ودون قرارك تبقى كما هي.`);
  for (const u of b.unchallenged) L.push(`- **نتيجة أضيفت متأخرة ولم يراجعها أحد** (${u.id}، ${lb.sev(u.severity)}): ${plainOf(u)}`);
  for (const c of b.conflicts) L.push(`- **حلّان متعارضان** (${c.findings.join(' و')}): ${c.note}`);
  for (const q of b.unknowns) L.push(lb.simple ? `- **سؤال تقني لم نستطع حسمه، يجيب عنه مبرمج** (${q.id}): ${q.question}` : `- **حقيقة بيئة غير معروفة** ${q.id} (${q.topic}): ${q.question}`);
  for (const it of b.items) for (const d of it.decisions) L.push(`- ${it.id}: ${lb.simple ? d.replace(/^[A-Z]+-\d+:\s*/, '') : d} _(سيُطرح عليك حين يُحضَّر هذا البند)_`);
  L.push('');

  L.push('## 2. ما تفعله أنت قبل أي بند');
  if (b.ownerActions.length) for (const a of b.ownerActions) L.push(`- ${lb.simple ? a.simple : a.developer}`);
  else L.push('- لا شيء.');
  L.push('');

  L.push('## 3. القائمة بالترتيب');
  L.push(`| الترتيب | البند | ${lb.simple ? 'الأهمية' : 'الأولوية'} | العمل | ${lb.simple ? 'لماذا يهم' : 'النتائج'} | ينتظر |`);
  L.push('|---|---|---|---|---|---|');
  b.items.forEach((it, i) => {
    const why = it.governance === 'agents_md' ? 'قواعد المشروع التي يلتزم بها الفريق في كل بند' : it.findings.map((f) => (lb.simple ? plainOf(f) : `${f.id}${f.disputed ? '⚠' : ''}`)).join(lb.simple ? '؛ ' : ', ');
    const waits = it.depends_on.map((d) => d.item);
    L.push(`| ${i + 1} | ${it.id} | ${lb.priority(it.priority)}${it.promoted ? ` ↑ (لأن ${it.promoted.because} ينتظره)` : ''} | ${esc(it.title)} | ${esc(why)} | ${waits.join(', ') || '—'} |`);
  });
  L.push('', lb.simple ? 'الأهمية محسوبة آلياً من جدول ثابت: مدى الخطورة، وهل ثبتت بالتجربة، ومن يستطيع استغلالها. لا تقدير شخصي فيها.' : 'الأولوية من جدول ثابت (الميثاق §7.8): الدرجة × الإثبات × قابلية الوصول × من يستطيع الاستغلال. لا تقدير يدوي.');
  L.push('', `لتحضير بند بعد دمج هذا التدقيق، اكتب: «حضّر البند B-01 من التدقيق ${auditId}». التحضير لا يغيّر شيئاً في برنامجك.`, '');

  L.push('## 4. ما لم يُفحص');
  const gaps = [...b.notExamined.map((x) => `${x.what} — ${x.reason}`), ...b.coverageGaps.map((c) => `${lb.simple ? 'جانب أمني لم يُختبر' : 'محور أمني لم يُختبر'}: ${c.axis} — ${c.reason}`)];
  if (gaps.length) for (const g of gaps) L.push(`- ${g}`);
  else L.push('- لا شيء مسجّل. (هذا القسم إلزامي حتى لو كان فارغاً.)');
  L.push('');

  L.push('## 5. تقدير المدير التقني');
  L.push(tmBegin, tmPlaceholder, tmEnd, '');

  L.push('# الجزء الثاني: التفاصيل التقنية (للمبرمج)', '');
  L.push(`> HEAD: \`${String(head || '').slice(0, 10)}\` · النتائج: ${b.stats.findings} (بعد دمج المكرر: ${b.stats.kept}) · مؤكد ${b.stats.confirmed} / مشتبه ${b.stats.suspected} · الطعن: ${b.stats.challenge.upheld} مُثبَتة، ${b.stats.challenge.disputed} مطعون فيها، ${b.stats.challenge.duplicate} مكررة`, '');
  L.push(`فتح بند: \`node .team/bin/phase.mjs new --from ${auditId}:<البند>\``, '');
  if (lb.simple && b.ownerActions.length) {
    L.push('**الإعدادات المطلوبة قبل أي بند:**');
    for (const a of b.ownerActions) L.push(`- ${a.developer}`);
    L.push('');
  }
  L.push('## 6. تفاصيل البنود');
  for (const it of b.items) {
    L.push(`### ${it.id} — ${it.title}`);
    L.push(`- الأولوية ${it.priority} · المسار ${it.path === 'full' ? 'الكامل' : 'الخفيف'} (${it.path_reason || '—'}) · المجال \`${it.area}\``);
    if (it.findings.length) L.push(`- النتائج: ${it.findings.map((f) => `${f.id} ${SEV[f.severity]}/${PROOF[f.proof]}${f.disputed ? ' ⚠ مطعون فيها' : ''}${f.merged.length ? ` (دُمجت معها ${f.merged.join(', ')})` : ''}`).join('؛ ')}`);
    const deps = it.depends_on.map((d) => `${d.item} (${d.type === 'governance' ? 'حوكمة' : 'منطقي'}${d.reason && d.type !== 'governance' ? `: ${d.reason}` : ''})`);
    if (deps.length) L.push(`- يعتمد على: ${deps.join('؛ ')}`);
    if (it.confirm_first.length) L.push(`- يُؤكَّد أولاً: ${it.confirm_first.map((c) => c.id).join(', ')}`);
    L.push(`- الملفات: ${it.files.map((f) => `\`${f}\``).join(', ')}`);
    if (it.shares_files_with.length) L.push(`- يشارك ملفات مع: ${it.shares_files_with.join(', ')} (لا تُنفّذ بالتوازي)`);
    L.push(`- الطلب الجاهز: \`requests/${it.id}.md\``, '');
  }

  L.push('## 7. المكرر والمدموج');
  if (b.duplicates.length) for (const d of b.duplicates) L.push(`- ${d.id} ← ${d.into}: ${d.reason}`);
  else L.push('- لا شيء.');
  L.push('');

  L.push('## 8. حقائق البيئة التي بُنيت عليها النتائج');
  L.push('| المعرّف | الموضوع | الحقيقة | الدليل |');
  L.push('|---|---|---|---|');
  for (const e of b.environment) L.push(`| ${e.id} | ${e.topic} | ${esc(e.fact)}${e.status === 'unknown' ? ' ⚠ غير معروفة' : ''} | ${esc(e.evidence || e.question || '')} |`);
  L.push('', 'إن كانت حقيقة منها خاطئة فاطلب التعديل: كل إصلاح يعتمد عليها مذكور في الطلبات الجاهزة.', '');
  return L.join('\n');
}

export function publicItem(it) {
  const { _findings, ...rest } = it;
  void _findings;
  return { ...rest, request: `requests/${it.id}.md` };
}

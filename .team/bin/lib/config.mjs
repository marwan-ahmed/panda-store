// Marwan SAT — project configuration (.team/project.yaml).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AUDIENCES, DEFAULT_PHRASES, normalizePhrase } from './plain.mjs';
import { parseYaml } from './yaml.mjs';

export const STACKS = ['nextjs', 'laravel', 'flutter', 'react-native', 'custom'];
export const PLATFORMS = ['antigravity', 'claude-code'];
export const PROFILES = ['web', 'mobile'];
export const ATTACK_ENVS = ['neon-branch', 'docker-postgres', 'docker-mysql', 'none'];
export const SCAN_SCOPES = ['diff', 'full'];
export const BRANCH_PROTECTION = ['required', 'accepted_risk'];
export const COMMAND_ORDER = ['install', 'typecheck', 'lint', 'build', 'test'];

export const DEFAULTS = {
  git: { base_branch: 'main', task_branch_prefix: 'sat/', branch_protection: 'required' },
  commands: { install: null, typecheck: null, lint: null, build: null, test: null, start: null, extra: [] },
  paths: { tests: [], sensitive_extra: [] },
  security: {
    profile: 'web',
    attack_env: 'none',
    env_up: null,
    env_down: null,
    seed: '.team/seed/',
    constitution: null,
    require_scanners: false,
    scan_scope: 'diff',
    scanners: { secrets: null, sast: null, dependencies: null },
  },
  owner: { audience: 'simple' },
  gates: { approval: 'agent', phrases: { ...DEFAULT_PHRASES } },
  guard: { no_task_policy: 'ask' },
  limits: { question_rounds: 2, verify_failures: 2, fix_cycles: 2, max_credits_per_task: null },
  audit: { max_findings_per_task: 3, max_files_per_task: 8 },
  timeouts: { step_minutes: 20 },
};

export function findRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.team', 'project.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function merge(base, over) {
  if (over === null || over === undefined) return structuredClone(base);
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

export function validateProject(cfg) {
  const errors = [];
  if (!cfg.project || typeof cfg.project !== 'object') errors.push('project: missing section');
  else {
    if (!cfg.project.name) errors.push('project.name: required');
    if (!STACKS.includes(cfg.project.stack)) errors.push(`project.stack: must be one of ${STACKS.join(', ')}`);
    if (!PLATFORMS.includes(cfg.project.platform)) errors.push(`project.platform: must be one of ${PLATFORMS.join(', ')}`);
  }
  if (!PROFILES.includes(cfg.security.profile)) errors.push(`security.profile: must be one of ${PROFILES.join(', ')}`);
  if (!SCAN_SCOPES.includes(cfg.security.scan_scope)) errors.push(`security.scan_scope: must be one of ${SCAN_SCOPES.join(', ')}`);
  if (!ATTACK_ENVS.includes(cfg.security.attack_env)) errors.push(`security.attack_env: must be one of ${ATTACK_ENVS.join(', ')}`);
  if (!BRANCH_PROTECTION.includes(cfg.git.branch_protection)) errors.push(`git.branch_protection: must be one of ${BRANCH_PROTECTION.join(', ')}`);
  if (!['agent', 'owner'].includes(cfg.gates.approval)) errors.push('gates.approval: must be "agent" or "owner"');
  if (!cfg.owner || !AUDIENCES.includes(cfg.owner.audience)) errors.push(`owner.audience: must be one of ${AUDIENCES.join(', ')}`);
  const phrases = (cfg.gates && cfg.gates.phrases) || {};
  const seen = new Map();
  for (const k of Object.keys(DEFAULT_PHRASES)) {
    const v = phrases[k];
    if (typeof v !== 'string' || normalizePhrase(v).length < 2) errors.push(`gates.phrases.${k}: must be a non-empty phrase`);
    else if (seen.has(normalizePhrase(v))) errors.push(`gates.phrases.${k}: must differ from gates.phrases.${seen.get(normalizePhrase(v))} (one reply must never approve two gates)`);
    else seen.set(normalizePhrase(v), k);
  }
  if (!['ask', 'allow', 'deny'].includes(cfg.guard.no_task_policy)) errors.push('guard.no_task_policy: must be ask, allow or deny');
  if (!Array.isArray(cfg.paths.tests) || cfg.paths.tests.length === 0) errors.push('paths.tests: at least one glob is required');
  if (!Array.isArray(cfg.commands.extra)) errors.push('commands.extra: must be a list');
  for (const k of ['question_rounds', 'verify_failures', 'fix_cycles']) {
    if (!Number.isInteger(cfg.limits[k]) || cfg.limits[k] < 1) errors.push(`limits.${k}: must be an integer >= 1`);
  }
  for (const k of ['max_findings_per_task', 'max_files_per_task']) {
    if (!Number.isInteger(cfg.audit[k]) || cfg.audit[k] < 1) errors.push(`audit.${k}: must be an integer >= 1`);
  }
  return errors;
}

export function loadProject(root) {
  const file = join(root, '.team', 'project.yaml');
  if (!existsSync(file)) throw new Error(`Not found: ${file}. Install SAT first (sat init).`);
  const raw = parseYaml(readFileSync(file, 'utf8'));
  const cfg = merge(DEFAULTS, raw);
  const errors = validateProject(cfg);
  if (errors.length) throw new Error(`project.yaml is invalid:\n- ${errors.join('\n- ')}`);
  return cfg;
}

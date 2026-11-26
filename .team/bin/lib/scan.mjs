// Marwan SAT — security scanners scoped to the change (charter §9.6).
//
// A task is judged on what it changed, not on debt that was already in the repository:
//   - secrets (gitleaks git):  only the commits of the change  → --log-opts=<base>..HEAD
//   - sast (semgrep):          only findings absent at the base → --baseline-commit=<base>
//   - dependencies (audits):   manifests untouched → findings are pre-existing debt (warn, reported);
//                              manifests changed   → fail only on advisories the change added.
// security.scan_scope: full in project.yaml restores whole-repository scans.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { filesAt, showFile } from './git.mjs';
import { matchAny } from './glob.mjs';
import { firstToken, runShell } from './proc.mjs';

// Files whose change can change the dependency set (any depth).
export const DEPENDENCY_MANIFESTS = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  '.yarnrc.yml',
  'bun.lock',
  'bun.lockb',
  'composer.json',
  'composer.lock',
  'pubspec.yaml',
  'pubspec.lock',
];

// Text files needed to re-run an audit on the base commit in a scratch folder.
const MATERIALIZE = DEPENDENCY_MANIFESTS.filter((f) => f !== 'bun.lockb').concat(['.npmrc']);

const RANK = { info: 0, low: 1, moderate: 2, medium: 2, high: 3, critical: 4 };
const rank = (s) => (String(s || '').toLowerCase() in RANK ? RANK[String(s).toLowerCase()] : -1);

export function binName(command) {
  return (firstToken(command) || '').split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
}

// Rewrites a scanner command so it only looks at the change. Returns { command, scoped, needsClean }.
export function scopeScannerCommand(kind, command, base) {
  if (!command || !base) return { command, scoped: false, needsClean: false };
  let cmd = command;
  let scoped = false;
  if (cmd.includes('{base}')) {
    cmd = cmd.split('{base}').join(base);
    scoped = true;
  } else {
    const bin = binName(cmd);
    if (kind === 'secrets' && bin === 'gitleaks' && /\s(git|detect)(\s|$)/.test(cmd) && !/--log-opts/.test(cmd)) {
      cmd = `${cmd} --log-opts=${base}..HEAD`;
      scoped = true;
    } else if (kind === 'sast' && bin === 'semgrep' && !/--baseline-commit/.test(cmd)) {
      cmd = `${cmd} --baseline-commit=${base}`;
      scoped = true;
    }
  }
  return { command: cmd, scoped, needsClean: binName(cmd) === 'semgrep' && /--baseline-commit/.test(cmd) };
}

export function changedManifests(changed) {
  return changed.filter((f) => matchAny(f, DEPENDENCY_MANIFESTS));
}

// Does the audit output describe findings (as opposed to a crash or a network error)?
export function looksLikeFindings(text) {
  return /vulnerabilit|advisor|severity|\bGHSA-|\bCVE-\d/i.test(text || '');
}

export function auditLevel(command) {
  const m = /--audit-level[= ]+(\w+)|--severity[= ]+(\w+)/.exec(command || '');
  return m ? (m[1] || m[2]).toLowerCase() : 'low';
}

// Audit tools whose JSON output SAT can compare between two commits.
export function auditTool(command) {
  const bin = binName(command);
  if (bin === 'npm' && /\baudit\b/.test(command)) return 'npm';
  if (bin === 'pnpm' && /\baudit\b/.test(command)) return 'pnpm';
  if (bin === 'composer' && /\baudit\b/.test(command)) return 'composer';
  return null;
}

export function jsonAuditCommand(tool, command) {
  if (tool === 'npm') return `${command}${/--json\b/.test(command) ? '' : ' --json'}${/--package-lock-only\b/.test(command) ? '' : ' --package-lock-only'}`;
  if (tool === 'pnpm') return `${command}${/--json\b/.test(command) ? '' : ' --json'}`;
  if (tool === 'composer') return `${command}${/--locked\b/.test(command) ? '' : ' --locked'}${/--format/.test(command) ? '' : ' --format=json'}`;
  return null;
}

function parseJsonLoose(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}

// Map<id, {id, severity, package, title}> of advisories at or above <minLevel>, or null if unreadable.
export function advisoriesFromJson(tool, text, minLevel = 'low') {
  const data = parseJsonLoose(text);
  if (!data || typeof data !== 'object') return null;
  const min = rank(minLevel);
  const out = new Map();
  const add = (id, severity, pkg, title) => {
    if (!id || rank(severity) < min) return;
    out.set(String(id), { id: String(id), severity: String(severity).toLowerCase(), package: pkg || '', title: title || '' });
  };
  if (tool === 'npm' && data.vulnerabilities && typeof data.vulnerabilities === 'object') {
    for (const [name, v] of Object.entries(data.vulnerabilities)) {
      for (const via of v.via || []) {
        if (via && typeof via === 'object') add(via.url || (via.source !== undefined ? `npm:${via.source}` : null), via.severity, via.name || name, via.title);
      }
    }
    return out;
  }
  if ((tool === 'npm' || tool === 'pnpm') && data.advisories && typeof data.advisories === 'object') {
    for (const a of Object.values(data.advisories)) add(a.github_advisory_id || a.url || a.id, a.severity, a.module_name, a.title);
    return out;
  }
  if (tool === 'composer' && 'advisories' in data) {
    const groups = Array.isArray(data.advisories) ? data.advisories : Object.values(data.advisories || {});
    for (const list of groups) {
      for (const a of Array.isArray(list) ? list : Object.values(list || {})) {
        // Composer leaves severity empty for some advisories: count those as high rather than ignore them.
        add(a.advisoryId || a.cve || a.link, a.severity || 'high', a.packageName, a.title);
      }
    }
    return out;
  }
  return null;
}

// Writes the dependency manifests as they were at <base> into a scratch folder.
function materializeBase(root, base) {
  const dir = mkdtempSync(join(tmpdir(), 'sat-base-'));
  let count = 0;
  for (const rel of filesAt(base, root)) {
    if (!matchAny(rel, MATERIALIZE)) continue;
    const text = showFile(base, rel, root);
    if (text === null) continue;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text, 'utf8');
    count += 1;
  }
  return { dir, count };
}

// Decides the dependencies step. Returns a partial step: { status, reason, preexisting?, added?, logs? }.
// <primary> is the result of running the configured command on HEAD.
export function judgeDependencies({ root, base, command, changed, primary, timeoutMs, logDir }) {
  if (primary.exitCode === 0) return { status: 'pass' };
  const output = `${primary.stdout}\n${primary.stderr}`;
  if (!base) return { status: 'fail', reason: 'no base commit to compare with' };
  const manifests = changedManifests(changed);
  if (manifests.length === 0) {
    if (!looksLikeFindings(output)) return { status: 'fail', reason: 'the audit did not complete (see the log)' };
    return {
      status: 'warn',
      preexisting: true,
      reason: `pre-existing dependency debt: no dependency manifest changed since ${base.slice(0, 7)}, so these findings were not introduced by this change`,
    };
  }
  const tool = auditTool(command);
  if (!tool) return { status: 'fail', reason: `dependency manifests changed (${manifests.slice(0, 5).join(', ')}) and SAT cannot compare this tool's findings with the base: fix them, or record a decision` };
  const level = auditLevel(command);
  const jsonCmd = jsonAuditCommand(tool, command);
  const head = runShell(jsonCmd, { cwd: root, timeoutMs });
  const { dir, count } = materializeBase(root, base);
  let baseRun;
  try {
    baseRun = count ? runShell(jsonCmd, { cwd: dir, timeoutMs }) : { exitCode: 0, stdout: '{}', stderr: '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const logs = {};
  if (logDir) {
    for (const [k, r] of [['head', head], ['base', baseRun]]) {
      const p = join(logDir, `dependencies.${k}.json.log`);
      writeFileSync(p, `$ ${jsonCmd}${k === 'base' ? `   (manifests at ${base})` : ''}\n# exit: ${r.exitCode}\n\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}\n`, 'utf8');
      logs[k] = p;
    }
  }
  const headAdv = advisoriesFromJson(tool, head.stdout, level);
  const baseAdv = count ? advisoriesFromJson(tool, baseRun.stdout, level) : new Map();
  if (!headAdv || !baseAdv) return { status: 'fail', reason: 'could not read the audit JSON for HEAD or the base (see the logs)', logs };
  const added = [...headAdv.values()].filter((a) => !baseAdv.has(a.id));
  const resolved = [...baseAdv.keys()].filter((id) => !headAdv.has(id)).length;
  if (added.length) {
    return {
      status: 'fail',
      reason: `the change added ${added.length} advisor${added.length === 1 ? 'y' : 'ies'} at ${level} or above: ${added
        .slice(0, 10)
        .map((a) => `${a.package} (${a.severity}) ${a.id}`)
        .join('; ')}`,
      added: added.map((a) => a.id),
      logs,
    };
  }
  return {
    status: 'warn',
    preexisting: true,
    reason: `the change added no advisories; ${headAdv.size} pre-existing at ${level} or above remain${resolved ? `, ${resolved} resolved by this change` : ''}`,
    logs,
  };
}

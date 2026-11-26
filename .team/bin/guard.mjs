#!/usr/bin/env node
// Marwan SAT — guard: PreToolUse hook for Google Antigravity (charter §10, §15.1).
//
// Reads the hook payload on stdin ({ toolCall: { name, args }, workspacePaths, ... })
// and prints a decision: {"decision":"allow"|"deny"|"ask","reason":"..."}.
//
// What it enforces (first line of defence; Git + CI remain the last line):
//   - Writes only to the files allowed in the current phase (and allowed_write in IMPLEMENT/FIX).
//   - SAT-managed, generated and tool-owned files are never written by agents.
//   - Reviewers do not read the implementer's notes (clean context).
//   - Dangerous shell commands; network targets outside localhost during REVIEW and the audit's FINDINGS/CHALLENGE;
//     gate approvals by agents when gates.approval = owner.
//   - Merging stays with the owner: no push to the base branch (by any refspec, or a bare push from it),
//     no `gh pr merge`, no merge through the GitHub API. Agents act with the owner's GitHub identity.
// Limitation (documented): a shell command can still write files. verify.mjs and CI catch that.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot, loadProject } from './lib/config.mjs';
import { currentBranch } from './lib/git.mjs';
import { matchAny, toPosix } from './lib/glob.mjs';
import { phaseWritable, protectedGlobs, readTasksJson } from './lib/scope.mjs';
import { readJSON, statePath, taskDir } from './lib/state.mjs';

const WRITE_TOOLS = /^(write_to_file|replace_file_content|multi_replace_file_content|create_file|edit_file|delete_file|move_file|rename_file)$/;
const READ_TOOLS = /^(view_file|read_file|view_file_outline|view_code_item)$/;
const SHELL_TOOLS = /^(run_command|run_terminal_command|bash|shell)$/;
const PATH_KEYS = ['TargetFile', 'AbsolutePath', 'FilePath', 'File', 'Path', 'path', 'file_path', 'target_file', 'DestinationFile', 'SourceFile'];

const DANGEROUS = [
  [/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/, 'Forced recursive delete (rm -rf) is blocked'],
  [/\bsudo\b/, 'sudo is blocked'],
  [/\bgit\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f\b)/, 'git push --force is blocked'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard is blocked'],
  [/\bgit\s+(commit|push)\b[^\n]*--no-verify\b/, '--no-verify is blocked'],
  [/\bgit\s+config\b[^\n]*\bcore\.hooksPath\b/, 'Changing the git hooks path is blocked'],
];

const DELEGATE_TOOLS = /^(invoke_subagent)$/;

// Evidence that a subagent was actually started (charter §15.1): the hook sees the tech manager's call, so the
// record comes from Antigravity, not from an agent's account of its work. Local only (evidence/ is not committed).
// Only the call's short string arguments are kept — the agent name and the brief's first words — never files.
function recordDelegation(root, payload, args) {
  try {
    const short = Object.fromEntries(Object.entries(args).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v.slice(0, 160)]));
    const dir = join(root, '.team', 'evidence');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'delegations.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), conversation: payload.conversationId || null, model: payload.modelName || null, args: short })}\n`, 'utf8');
  } catch {
    /* evidence is best effort: it never blocks the call */
  }
}

const MERGE_DENIED = "Merging into the base branch is the owner's decision: the owner presses Merge on GitHub";
const escapeRx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Rules that keep merging in the owner's hands (charter §10). The base branch comes from project.yaml.
export function mergeRules(base) {
  const ref = `(?:${[...new Set([base, 'main', 'master'])].filter(Boolean).map(escapeRx).join('|')})`;
  return [
    [new RegExp(`\\bgit\\s+push\\b[^\\n]*(?:\\s|:|\\+|["']|refs/heads/)${ref}(?=$|[\\s'";&|)])`), 'Pushing to the base branch is blocked: the owner merges through a PR'],
    [/\bgh\s+pr\s+merge\b/, MERGE_DENIED],
    [/\bgh\s+api\b[^\n]*\/pulls\/[^\s/]+\/merge\b/, MERGE_DENIED],
    [/\bgh\s+api\b[^\n]*\/merges\b/, MERGE_DENIED],
  ];
}

function out(decision, reason) {
  process.stdout.write(`${JSON.stringify(reason ? { decision, reason: `[Marwan SAT] ${reason}` } : { decision })}\n`);
  process.exit(0);
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function targetPath(args) {
  for (const k of PATH_KEYS) if (typeof args[k] === 'string' && args[k].trim()) return args[k];
  return null;
}

function sameOrInside(child, parent) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function decide(payload, { cwd = process.cwd() } = {}) {
  const call = payload && payload.toolCall ? payload.toolCall : {};
  const tool = String(call.name || '');
  const args = call.args || {};
  // Antigravity runs workspace hooks from inside .agents/, so without workspacePaths walk up to the project root.
  const root = resolve((payload.workspacePaths && payload.workspacePaths[0]) || findRoot(cwd) || cwd);
  if (!existsSync(join(root, '.team', 'project.yaml'))) return { decision: 'allow' };

  let cfg;
  try {
    cfg = loadProject(root);
  } catch (e) {
    return { decision: 'ask', reason: `project.yaml is invalid: ${e.message}` };
  }
  if (DELEGATE_TOOLS.test(tool)) recordDelegation(root, payload, args);
  const state = readJSON(statePath(root), null);
  const task = state && state.active_task ? readJSON(join(taskDir(root, state.active_task), 'task.json'), null) : null;
  const phase = task ? task.phase : null;

  if (SHELL_TOOLS.test(tool)) {
    const cmd = String(args.CommandLine || args.command || args.cmd || '');
    for (const [rx, why] of [...DANGEROUS, ...mergeRules(cfg.git.base_branch)]) if (rx.test(cmd)) return { decision: 'deny', reason: why };
    // A push that does not name the task branch, run while the base branch is checked out, would update the base branch.
    if (/\bgit\s+push\b/.test(cmd) && !cmd.includes(cfg.git.task_branch_prefix) && [cfg.git.base_branch, 'main', 'master'].includes(currentBranch(root)))
      return { decision: 'deny', reason: `You are on the base branch: push the task branch by name (${cfg.git.task_branch_prefix}TASK-<n>)` };
    if (cfg.gates.approval === 'owner' && (/phase(\.mjs)?\s+(approve|resume)\b/.test(cmd) || /\bupdate\b[^\n]*--approve\b/.test(cmd)))
      return { decision: 'deny', reason: 'Gate approvals, task resumes and team updates are run by the owner personally (gates.approval = owner)' };
    if (['REVIEW', 'FINDINGS', 'CHALLENGE'].includes(phase)) {
      const hosts = [...cmd.matchAll(/\bhttps?:\/\/([^/\s:'"]+)/gi)].map((m) => m[1].toLowerCase());
      const external = hosts.filter((h) => !['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(h));
      if (external.length) return { decision: 'deny', reason: `During ${phase === 'REVIEW' ? 'review' : 'an audit'} only localhost targets are allowed (rules of engagement): ${external.join(', ')}` };
    }
    return { decision: 'allow' };
  }

  if (READ_TOOLS.test(tool)) {
    const p = targetPath(args);
    if (p && phase === 'REVIEW' && /IMPLEMENTATION_NOTES\.md$/i.test(toPosix(p)))
      return { decision: 'deny', reason: 'Reviewers work with a clean context: the implementer notes are off limits' };
    return { decision: 'allow' };
  }

  if (!WRITE_TOOLS.test(tool)) return { decision: 'allow' };

  const p = targetPath(args);
  if (!p) return { decision: 'ask', reason: `Could not determine the target file of tool ${tool}` };
  const abs = resolve(root, p);
  const gemCfg = join(homedir(), '.gemini', 'config');
  if (sameOrInside(abs, gemCfg)) return { decision: 'deny', reason: 'Agents do not edit the global Antigravity settings' };
  if (!sameOrInside(abs, root)) return { decision: 'allow' };
  const rel = toPosix(relative(root, abs));

  if (matchAny(rel, protectedGlobs(root))) return { decision: 'deny', reason: `${rel} is owned by the SAT tools or template; no agent writes it` };

  if (!task) {
    const policy = cfg.guard.no_task_policy;
    if (policy === 'allow') return { decision: 'allow' };
    const why = 'No active SAT task. Start one through the tech manager: node .team/bin/phase.mjs new "<title>"';
    return { decision: policy === 'deny' ? 'deny' : 'ask', reason: why };
  }

  const allowed = phaseWritable(phase, task, cfg, readTasksJson(root, task));
  if (matchAny(rel, allowed)) return { decision: 'allow' };
  return {
    decision: 'deny',
    reason: `Phase ${phase} does not allow writing ${rel}. Allowed: ${allowed.length ? allowed.join(', ') : 'nothing (a gate or a paused phase)'}`,
  };
}

// The hook entry point: read the payload on stdin, print one decision. Called directly, or by the
// forwarding shim at .agents/.team/bin/guard.mjs (see adapters/antigravity/generate.mjs).
export function runHook() {
  let payload = {};
  try {
    const raw = readStdin();
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    out('ask', 'Could not read the hook input');
  }
  try {
    const d = decide(payload);
    out(d.decision, d.reason);
  } catch (e) {
    out('ask', `Internal guard error: ${e.message}`);
  }
}

const isMain = Boolean(process.argv[1]) && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) runHook();

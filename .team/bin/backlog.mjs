#!/usr/bin/env node
// Marwan SAT — backlog: turns a challenged audit into an ordered, sized backlog (charter §5.5, §7.8).
//
//   node .team/bin/backlog.mjs
//
// Reads INVENTORY.json, findings/*.json and challenge/*.json of the active audit task (phase BACKLOG),
// validates them again, and writes:
//   BACKLOG.json         the items, their priority, path, dependencies and decisions   (tool-owned)
//   requests/B-<n>.md    one draft REQUEST.md per item, for `phase new --from`          (tool-owned)
//   BACKLOG.md           the owner's view; only the tech-manager section is hand-written (hash-locked)
// Same input, same backlog: priorities come from a fixed table, never from judgement.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBacklog, checkAudit, loadSensitive, publicItem, renderBacklog, renderRequest } from './lib/audit.mjs';
import { findRoot, loadProject } from './lib/config.mjs';
import { readJSONFile } from './lib/contracts.mjs';
import { headSha } from './lib/git.mjs';
import { stageOf } from './lib/plain.mjs';
import { reportHash, TM_BEGIN, TM_END, TM_PLACEHOLDER } from './lib/report-hash.mjs';
import { activeTask, appendLedger, taskDir, writeTask } from './lib/state.mjs';

function main() {
  const root = findRoot();
  if (!root) throw new Error('Could not find .team/project.yaml');
  const cfg = loadProject(root);
  const task = activeTask(root);
  if (!task) throw new Error('No active task.');
  if (task.kind !== 'audit') throw new Error(`${task.id} is not an audit task.`);
  if (!['BACKLOG', 'GATE_A'].includes(task.phase)) throw new Error(`backlog runs in the BACKLOG phase only (current phase: ${task.phase}).`);
  const dir = taskDir(root, task.id);
  const { errors, data } = checkAudit(root, cfg, task, 'challenge');
  if (errors.length) throw new Error(`The audit contracts are not valid:\n- ${errors.join('\n- ')}`);
  const vsum = task.last_verify ? readJSONFile(join(root, task.last_verify.dir, 'summary.json')).value : null;
  const backlog = buildBacklog(data, {
    root,
    auditId: task.id,
    sensitive: loadSensitive(root, cfg),
    limits: cfg.audit,
    agentsMd: existsSync(join(root, 'AGENTS.md')),
    verifySummary: vsum,
    profile: cfg.security.profile,
    attackEnv: cfg.security.attack_env,
  });
  const head = headSha(root);

  // Draft requests: replace the whole folder, so an item that disappeared leaves no stale request behind.
  const reqDir = join(dir, 'requests');
  if (existsSync(reqDir)) for (const n of readdirSync(reqDir)) rmSync(join(reqDir, n), { force: true });
  mkdirSync(reqDir, { recursive: true });
  for (const it of backlog.items) writeFileSync(join(reqDir, `${it.id}.md`), renderRequest(it, { auditId: task.id, environment: backlog.environment }), 'utf8');

  const json = {
    tool: 'marwan-sat/backlog',
    audit_task: task.id,
    title: task.title,
    sha: head,
    generated_at: new Date().toISOString(),
    limits: cfg.audit,
    stats: backlog.stats,
    owner_actions: backlog.ownerActions,
    disputed: backlog.disputed,
    unchallenged: backlog.unchallenged,
    conflicts: backlog.conflicts,
    duplicates: backlog.duplicates,
    unknowns: backlog.unknowns,
    items: backlog.items.map(publicItem),
  };
  writeFileSync(join(dir, 'BACKLOG.json'), `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  const text = renderBacklog(backlog, { auditId: task.id, title: task.title, head, tmBegin: TM_BEGIN, tmPlaceholder: TM_PLACEHOLDER, tmEnd: TM_END, audience: cfg.owner.audience, badge: stageOf(task).badge });
  const out = join(dir, 'BACKLOG.md');
  let finalText = text;
  if (existsSync(out)) {
    const old = readFileSync(out, 'utf8').replace(/\r\n/g, '\n');
    const a = old.indexOf(TM_BEGIN);
    const b = old.indexOf(TM_END);
    if (a >= 0 && b > a) finalText = text.replace(`${TM_BEGIN}\n${TM_PLACEHOLDER}\n${TM_END}`, `${TM_BEGIN}${old.slice(a + TM_BEGIN.length, b)}${TM_END}`);
  }
  writeFileSync(out, finalText, 'utf8');
  task.backlog_hash = reportHash(finalText);
  writeTask(root, task);
  appendLedger(root, { type: 'backlog', task: task.id, sha: head, items: backlog.items.length, findings: backlog.stats.kept });
  console.log(`[SAT] ✓ Wrote ${task.id}/BACKLOG.md, BACKLOG.json and ${backlog.items.length} draft request(s) in requests/.`);
  console.log('[SAT] Next: write only the tech-manager section of BACKLOG.md, commit the task files, push, open a PR, then phase next.');
}

try {
  main();
} catch (e) {
  console.error(`[SAT] ✗ ${e.message}`);
  process.exit(1);
}

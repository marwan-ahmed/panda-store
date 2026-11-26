#!/usr/bin/env node
// Marwan SAT — report: builds REPORT.md from the contracts and the evidence (charter §8, template 12.6).
// Every section is generated except the tech-manager risk section. The generated part is hash-locked.
// Part one is for the owner's decision, in the vocabulary of owner.audience; part two is the technical detail
// (files, logs, ids) for whoever programs (charter §6.1).
//
//   node .team/bin/report.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRoot, loadProject } from './lib/config.mjs';
import { acceptanceItems, extractIds, isBlocking, readJSONFile, readText } from './lib/contracts.mjs';
import { effectiveBase, git } from './lib/git.mjs';
import { commandExists } from './lib/proc.mjs';
import { reportHash, TM_BEGIN, TM_END, TM_PLACEHOLDER } from './lib/report-hash.mjs';
import { labels, stageOf } from './lib/plain.mjs';
import { activeTask, appendLedger, readLedger, taskDir, writeTask } from './lib/state.mjs';
import { spawnSync } from 'node:child_process';

const SEV_AR = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const PROOF_AR = { confirmed: 'مؤكد', suspected: 'مشتبه' };
const STATUS_AR = { pass: 'نجح', fail: 'فشل', skipped: 'تُخطّي', missing: 'الأداة غير مثبتة', not_configured: 'غير مُعدّ', warn: 'تحذير' };

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function section(md, heading) {
  if (!md) return null;
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith(heading));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

function prUrl(root) {
  if (!commandExists('gh')) return null;
  const r = spawnSync('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function main() {
  const root = findRoot();
  if (!root) throw new Error('Could not find .team/project.yaml');
  const cfg = loadProject(root);
  const task = activeTask(root);
  if (!task) throw new Error('No active task.');
  if (!['REPORT', 'GATE_2'].includes(task.phase)) throw new Error(`report runs in the REPORT phase only (current phase: ${task.phase}).`);
  const dir = taskDir(root, task.id);
  const request = readText(join(dir, 'REQUEST.md')) || '(REQUEST.md مفقود)';
  const exec = readText(join(dir, 'EXEC_PROMPT.md'));
  const goal = section(exec, '## 1.') || '(غير متاح)';
  const tasks = readJSONFile(join(dir, 'TASKS.json')).value;
  const review = readJSONFile(join(dir, 'REVIEW.json')).value;
  const audit = task.path === 'full' ? readJSONFile(join(dir, 'SECURITY_AUDIT.json')).value : null;
  const lv = task.last_verify;
  const vsum = lv ? readJSONFile(join(root, lv.dir, 'summary.json')).value : null;
  const head = git(['rev-parse', 'HEAD'], root);
  const base = effectiveBase(root, cfg.git.base_branch, task.base_sha) || task.base_sha;
  const diffStat = (git(['diff', '--stat', `${base}..HEAD`], root, { allowFail: true, raw: true }) || '').replace(/\s+$/, '') || '(لا تغييرات)';
  const spec = readText(join(dir, 'SPEC.md'));
  const threat = readText(join(dir, 'THREAT_MODEL.md'));
  const trace = readText(join(dir, 'TRACE.md')) || '';
  const ids = [...extractIds(spec, 'AC'), ...extractIds(threat, 'AB')];
  const uncovered = ids.filter((id) => !new RegExp(`\\b${id}\\b`).test(trace));
  const findings = [...((review && review.findings) || []).map((f) => ({ ...f, src: 'المراجع' })), ...((audit && audit.findings) || []).map((f) => ({ ...f, src: 'المدقق الأمني' }))];
  const pr = prUrl(root);

  const lb = labels(cfg.owner.audience);
  const say = (f) => (typeof f.plain === 'string' && f.plain.trim() ? f.plain.trim() : f.scenario || (f.exploit && f.exploit.request) || f.id).replace(/[.،]\s*$/, '');

  // Decisions required (part one).
  const decisions = [];
  // Commits after the verified one that only carry the task's records (the report, the ledger, decisions) do
  // not change the program, so they do not invalidate the check.
  const recordsOnly = (from) => {
    const names = git(['diff', '--name-only', from, 'HEAD'], root, { allowFail: true });
    return names !== null && names.split('\n').filter(Boolean).every((f) => f.startsWith(`.team/tasks/${task.id}/`) || ['.team/LEDGER.jsonl', '.team/DECISIONS.md'].includes(f));
  };
  const verifyOk = vsum && vsum.result === 'pass' && (!vsum.sha || vsum.sha === head || recordsOnly(vsum.sha));
  const toAccept = acceptanceItems(review, audit);
  if (!verifyOk)
    decisions.push(lb.simple ? '**لا تدمج الآن:** آخر فحص آلي للبرنامج لم ينجح، أو لم يُشغَّل على النسخة الأخيرة.' : '**لا يجوز الدمج:** آخر تشغيل لـ verify لم ينجح أو لا يطابق HEAD.');
  for (const f of findings.filter((x) => x.severity === 'medium'))
    decisions.push(lb.simple ? `مشكلة متوسطة وجدها ${f.src}: ${say(f)} — هل نصلحها الآن، أم تقبل بقاءها؟ (${f.id})` : `ملاحظة Medium ${f.id} (${f.src}): إصلاح أم قبول المخاطرة؟`);
  for (const f of findings.filter((x) => x.proof === 'suspected' && ['critical', 'high'].includes(x.severity)))
    decisions.push(
      lb.simple
        ? `مشكلة ${lb.sev(f.severity)} يشتبه بها ${f.src} ولم تُثبت بالتجربة: ${say(f)} — هل تطلب إصلاحاً احتياطياً؟ (${f.id})`
        : `ملاحظة ${lb.sev(f.severity)} **مشتبهة** ${f.id} (${f.src}): بند إلزامي. هل تطلب دورة إصلاح وقائية؟`,
    );
  if (audit && audit.verdict === 'INCOMPLETE') decisions.push(lb.simple ? 'الفحص الأمني لم يكتمل: بعض الجوانب لم تُختبر (التفاصيل في القسم 4). هل تقبل ذلك؟' : 'التدقيق الأمني INCOMPLETE: هل تقبل التغطية الجزئية؟');
  for (const st of (vsum && vsum.steps) || []) {
    if (st.preexisting)
      decisions.push(
        lb.simple
          ? `في البرنامج مشكلة قديمة لم تُدخلها هذه المهمة («${lb.step(st.name)}»). لا تمنع اعتماد هذه المهمة، لكنها تحتاج مهمة مستقلة.`
          : `**دين أمني مسبق خارج نطاق المهمة** («${st.name}»): لم تُدخله هذه المهمة فلا يُحتسب عليها، لكنه قائم في المشروع. افتح مهمة لمعالجته (السجل: \`${st.log || '—'}\`).`,
      );
  }

  // Not done / failed / not tested (part one).
  const gaps = [];
  if (vsum) {
    const notSet = lb.simple ? vsum.steps.filter((st) => st.status === 'not_configured') : [];
    if (notSet.length) gaps.push(`فحوص آلية غير مُعدّة في هذا المشروع، فلم تُشغَّل: ${notSet.map((st) => lb.step(st.name)).join('، ')}.`);
    for (const st of vsum.steps) if (st.status !== 'pass' && !notSet.includes(st)) gaps.push(`${lb.simple ? 'الفحص الآلي' : 'خطوة verify'} «${lb.step(st.name)}»: ${st.preexisting ? 'مشكلة قديمة (تحذير)' : STATUS_AR[st.status] || st.status}${st.reason && !lb.simple ? ` — ${st.reason}` : ''}`);
    for (const st of vsum.steps) if (st.kind === 'scanner' && st.scope === 'full' && vsum.scan_scope === 'diff' && ['pass', 'fail'].includes(st.status)) gaps.push(`الماسح «${lb.step(st.name)}» فحص المستودع كله لأن SAT لا يعرف كيف يحصره بالتغيير لهذه الأداة.`);
    for (const c of vsum.checks) if (c.status !== 'pass') gaps.push(`فحص «${c.name}» فشل${lb.simple ? ' (التفاصيل في القسم 7)' : `: ${Array.isArray(c.details) ? c.details.join(', ') : c.details}`}`);
  } else gaps.push(lb.simple ? 'لم يُشغَّل الفحص الآلي للبرنامج.' : 'لا يوجد تشغيل verify مسجّل.');
  if (uncovered.length) gaps.push(lb.simple ? `${uncovered.length} من شروط النجاح بلا اختبار آلي (${uncovered.join(', ')}).` : `غير مغطى في TRACE.md: ${uncovered.join(', ')}`);
  if (audit) for (const c of audit.coverage || []) if (c.status === 'NOT_TESTED') gaps.push(`${lb.simple ? 'جانب أمني لم يُختبر' : 'محور أمني لم يُختبر'}: ${c.axis} — ${c.reason}`);
  if (task.path === 'light') gaps.push(lb.simple ? 'هذه مهمة مختصرة: لم يُكتب لها تصميم ولا فحص أمني مخصص، واكتفينا بالفحوص الآلية.' : 'مسار خفيف: لا نموذج تهديدات ولا تدقيق أمني بوكيل (الماسحات فقط).');
  // In the simple view, suspected medium/high/critical findings are already decisions in §1: list the rest only.
  for (const f of findings.filter((x) => x.proof === 'suspected' && (!lb.simple || x.severity === 'low'))) gaps.push(lb.simple ? `مشكلة بسيطة مشتبهة لم تُثبت بالتجربة: ${say(f)} (${f.id})` : `ملاحظة مشتبهة غير مثبتة: ${f.id}`);
  if (tasks && Array.isArray(tasks.items))
    for (const it of tasks.items) {
      const missingIds = (it.acceptance || []).concat(it.abuse_cases || []).filter((id) => !new RegExp(`\\b${id}\\b`).test(trace));
      if (missingIds.length) gaps.push(`${lb.simple ? 'العمل' : 'المهمة'} ${it.id} — ${it.title}: ${lb.simple ? 'شروط بلا اختبار' : 'معرّفات بلا اختبار في TRACE'} (${missingIds.join(', ')})`);
    }

  // 8. Consumption.
  const events = readLedger(root).filter((e) => e.task === task.id);
  const verifyRuns = events.filter((e) => e.type === 'verify').length;
  const credits = events.filter((e) => e.type === 'usage' && Number.isFinite(e.credits)).reduce((a, e) => a + e.credits, 0);
  const hours = ((Date.now() - Date.parse(task.created_at)) / 36e5).toFixed(1);

  // The owner's count is of the program's files: SAT's own task records are not part of the program.
  const files = (git(['diff', '--name-only', `${base}..HEAD`], root, { allowFail: true }) || '').split(/\r?\n/).filter((f) => f && !f.startsWith('.team/') && !f.startsWith('.agents/'));
  const L = [];
  L.push(`# تقرير المهمة — ${task.id}: ${task.title}`);
  L.push('');
  L.push(`> ${stageOf(task).badge}`);
  L.push('>');
  L.push('> هذا التقرير جزآن: **الأول لك** لتتخذ القرار، **والثاني للمبرمج** (الملفات والسجلات). مولَّد آلياً بأداة `report.mjs`، إلا القسم 5. أي تعديل يدوي على الأقسام المولّدة يُبطل التقرير.');
  L.push('');
  L.push('# الجزء الأول: لك');
  L.push('');
  L.push('## 1. القرار المطلوب منك');
  for (const d of decisions) L.push(`- ${d}`);
  // Merging is the approval (charter §6). Written words are needed only to accept the risks listed above.
  if (toAccept.length)
    L.push(`- **لقبول ما سبق** اكتب حرفياً: «${cfg.gates.phrases.result}»، ثم اضغط **Merge** في ${lb.pr}${pr ? `: ${pr}` : ' (رابطه في رسالة المدير التقني)'}. هنا لا يكفي الدمج وحده: قبولك المكتوب يُسجَّل في سجل المهمة.`);
  else L.push(`- **للاعتماد** اضغط **Merge** في ${lb.pr}${pr ? `: ${pr}` : ' (رابطه في رسالة المدير التقني)'}. ضغطة Merge هي اعتمادك، ولا تحتاج إلى كتابة شيء. الدمج بيدك وحدك.`);
  L.push('- **لطلب تعديل** اكتب: «عدّل: …» مع ما تريد. **وللإلغاء:** «ألغِ المهمة».');
  L.push('- أي رد غير ذلك لا يُعدّ اعتماداً.');
  L.push('');
  L.push('## 2. طلبك كما كتبته');
  for (const line of request.trim().split(/\r?\n/)) L.push(`> ${line}`);
  L.push('');
  L.push('## 3. ماذا أُنجز، باختصار');
  if (tasks && Array.isArray(tasks.items) && tasks.items.length) {
    L.push(lb.simple ? '**الأعمال التي نُفّذت:**' : '**المهام (TASKS.json):**');
    for (const it of tasks.items) L.push(`- ${esc(it.title)}`);
    L.push('');
    L.push('**النتيجة:**');
  }
  L.push(`- ${lb.simple ? `عدد الملفات التي تغيّرت في برنامجك: ${files.length} (أسماؤها في القسم 7).` : `الملفات المتغيرة: ${files.length} (القسم 7).`}`);
  L.push(`- ${lb.simple ? `الفحص الآلي للبرنامج: **${verifyOk ? 'نجح' : 'لم ينجح'}**.` : `verify: **${verifyOk ? 'نجاح' : 'فشل أو لا يطابق HEAD'}**.`}`);
  L.push(`- ${lb.simple ? 'المراجعة' : 'حكم المراجع'}: ${lb.review(review && review.verdict)}.`);
  if (task.path === 'full') L.push(`- ${lb.simple ? 'الفحص الأمني' : 'حكم المدقق الأمني'}: ${lb.security(audit && audit.verdict)}.`);
  // Medium and suspected findings are already decisions in §1; the simple view does not repeat them here.
  const shown = findings.filter((f) => ['critical', 'high', 'medium'].includes(f.severity) && !lb.simple);
  if (shown.length) {
    L.push('');
    L.push(lb.simple ? 'مشكلات لاحظها الفريق في آخر مراجعة:' : 'ملاحظات آخر جولة مراجعة:');
    for (const f of shown) L.push(`- **${lb.sev(f.severity)}، ${lb.proof(f.proof)}:** ${esc(say(f))}${isBlocking(f) ? (lb.simple ? ' — تمنع الاعتماد حتى تُصلح.' : ' ⛔') : ''}`);
  }
  L.push('');
  L.push('## 4. ما لم يُنجز أو فشل أو لم يُختبر');
  if (gaps.length) for (const g of gaps) L.push(`- ${g}`);
  else L.push('- لا شيء مسجّل. (هذا القسم إلزامي حتى لو كان فارغاً.)');
  L.push('');
  L.push('## 5. تقدير المخاطر (يكتبه المدير التقني)');
  L.push(TM_BEGIN);
  L.push(TM_PLACEHOLDER);
  L.push(TM_END);
  L.push('');
  L.push('# الجزء الثاني: التفاصيل التقنية (للمبرمج)');
  L.push('');
  L.push(`> المسار: ${task.path === 'full' ? 'كامل' : 'خفيف'} · الفرع: \`${task.branch}\` · HEAD: \`${head.slice(0, 10)}\`${pr ? ` · PR: ${pr}` : ' · PR: يفتحه SAT عند الانتقال إلى البوابة 2'}`);
  L.push('');
  L.push('## 6. الهدف كما صاغه مفسّر الطلب (EXEC_PROMPT §1)');
  L.push(goal);
  L.push('');
  L.push('## 7. ما تغيّر');
  L.push('```text');
  L.push(diffStat);
  L.push('```');
  if (tasks && Array.isArray(tasks.items)) {
    L.push('');
    L.push('| المهمة | العنوان | معايير القبول | حالات الإساءة | الملفات المسموحة |');
    L.push('|---|---|---|---|---|');
    for (const it of tasks.items) L.push(`| ${esc(it.id)} | ${esc(it.title)} | ${esc((it.acceptance || []).join(', '))} | ${esc((it.abuse_cases || []).join(', ') || '—')} | ${esc((it.allowed_write || []).map((x) => `\`${x}\``).join(', '))} |`);
  }
  L.push('');
  L.push('## 8. التحقق');
  if (vsum) {
    L.push(`آخر تشغيل: \`${lv.dir}\` على \`${String(vsum.sha).slice(0, 10)}\` — **${vsum.result === 'pass' ? 'نجاح' : 'فشل'}**${vsum.dirty ? ' (على شجرة غير نظيفة)' : ''}`);
    L.push('');
    if (vsum.scan_scope) L.push(`نطاق الماسحات: **${vsum.scan_scope === 'diff' ? `التغيير وحده مقارنةً بـ \`${String(vsum.base || '').slice(0, 10)}\`` : 'المستودع كله'}** (الميثاق §9.6)`);
    L.push('');
    L.push('| الخطوة | الحالة | رمز الخروج | السجل |');
    L.push('|---|---|---|---|');
    for (const st of vsum.steps) L.push(`| ${esc(st.name)} | ${st.preexisting ? 'دين مسبق (تحذير)' : STATUS_AR[st.status] || st.status} | ${st.exit_code ?? '—'} | ${st.log ? `\`${st.log}\`` : '—'} |`);
    for (const c of vsum.checks) L.push(`| check:${esc(c.name)} | ${STATUS_AR[c.status] || c.status} | — | ${esc(Array.isArray(c.details) ? c.details.join(', ') : c.details || '')} |`);
  } else L.push('**لا يوجد تشغيل verify مسجّل.**');
  L.push('');
  L.push(`نتيجة CI على PR هي المرجع النهائي (الميثاق §8.1).${pr ? ` راجعها في ${pr}` : ''}`);
  L.push('');
  L.push(`تغطية TRACE: ${ids.length - uncovered.length} من ${ids.length} معرّفاً (معايير القبول وحالات الإساءة).`);
  L.push('');
  L.push('## 9. المراجعة والتدقيق الأمني');
  L.push(`- حكم المراجع: **${review ? review.verdict : 'غير متاح'}**`);
  if (task.path === 'full') L.push(`- حكم المدقق الأمني: **${audit ? audit.verdict : 'غير متاح'}** (CLEAR_WITHIN_SCOPE تعني: لم تثبت ثغرة Critical/High ضمن ما اختُبر فعلاً، لا أن النظام آمن)`);
  L.push(`- دورات الإصلاح: ${task.fix_cycles}`);
  L.push('');
  if (findings.length) {
    L.push('| المعرّف | المصدر | الخطورة | الإثبات | الموقع | السيناريو / الإصلاح |');
    L.push('|---|---|---|---|---|---|');
    for (const f of findings) L.push(`| ${esc(f.id)} | ${f.src} | ${SEV_AR[f.severity] || f.severity}${isBlocking(f) ? ' ⛔' : ''} | ${PROOF_AR[f.proof] || f.proof} | ${esc(f.location)} | ${esc(f.scenario || (f.exploit && f.exploit.request) || '')} ← ${esc(f.fix)} |`);
  } else L.push('لا ملاحظات مسجّلة في آخر جولة مراجعة.');
  if (audit && Array.isArray(audit.coverage)) {
    L.push('');
    L.push('| المحور الأمني | التغطية | السبب |');
    L.push('|---|---|---|');
    for (const c of audit.coverage) L.push(`| ${esc(c.axis)} | ${c.status} | ${esc(c.reason || '')} |`);
  }
  L.push('');
  L.push('## 10. الاستهلاك');
  L.push(`- الزمن منذ فتح المهمة: ${hours} ساعة`);
  L.push(`- مرات تشغيل verify: ${verifyRuns}`);
  L.push(`- دورات الإصلاح: ${task.fix_cycles}`);
  L.push(`- التكلفة (AI Credits): ${credits > 0 ? credits : 'غير مسجّلة آلياً'}`);
  L.push('');

  const text = L.join('\n');
  const out = join(dir, 'REPORT.md');
  // Preserve an already-written risk section when the report is regenerated.
  let finalText = text;
  if (existsSync(out)) {
    const old = readFileSync(out, 'utf8').replace(/\r\n/g, '\n');
    const a = old.indexOf(TM_BEGIN);
    const b = old.indexOf(TM_END);
    if (a >= 0 && b > a) {
      const inner = old.slice(a + TM_BEGIN.length, b);
      finalText = text.replace(`${TM_BEGIN}\n${TM_PLACEHOLDER}\n${TM_END}`, `${TM_BEGIN}${inner}${TM_END}`);
    }
  }
  writeFileSync(out, finalText, 'utf8');
  task.report_hash = reportHash(finalText);
  writeTask(root, task);
  appendLedger(root, { type: 'report', task: task.id, sha: head });
  console.log(`[SAT] ✓ Wrote ${task.id}/REPORT.md. Now write only the risk assessment section, then phase next.`);
}

try {
  main();
} catch (e) {
  console.error(`[SAT] ✗ ${e.message}`);
  process.exit(1);
}

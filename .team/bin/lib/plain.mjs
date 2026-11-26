// Marwan SAT — what the owner sees (charter §6.1, §6.2).
//
// Two things live here, so every tool says them the same way:
//   1. Where the work stands — preparation (nothing in the project changed) or execution (the team is changing
//      it) — as one badge line at the top of every message and document addressed to the owner.
//   2. The exact words that approve a gate. The tool records an approval only when the owner's reply is
//      exactly the phrase (after harmless normalisation), so "ok", "تمام" or an approval of the plan can never
//      start the work.
// And the vocabulary of the two audiences (owner.audience in project.yaml): "simple" for an owner who does
// not program, "developer" for one who does.

export const AUDIENCES = ['simple', 'developer'];

export const DEFAULT_PHRASES = {
  plan: 'اعتمد الخطة',
  start: 'ابدأ التنفيذ',
  result: 'اعتمد النتيجة',
  backlog: 'اعتمد القائمة', // no longer approves anything: Gate A closes when the owner merges (0.5.0); kept so older project.yaml files stay valid
  update: 'نفّذ التحديث', // approves a team update (sat update --approve), not a gate
};

// Which phrase approves which gate. Gate 0 is answered with the owner's own answers, not with a phrase.
export const GATE_PHRASE = { GATE_1: 'plan', GATE_START: 'start', GATE_2: 'result', GATE_A: 'backlog' };

// Harmless differences only: diacritics, tatweel, alef/ya/ta-marbuta forms, quotes, punctuation, spaces.
// Anything else — an extra word, a different verb — is a different reply.
export function normalizePhrase(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[«»"'“”‘’`.,!?؟،؛:()[\]{}\-—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function phraseMatches(reply, phrase) {
  return normalizePhrase(reply).length > 0 && normalizePhrase(reply) === normalizePhrase(phrase);
}

export const PREPARATION = ['INTAKE', 'INTERPRET', 'GATE_0', 'DESIGN', 'THREAT', 'GATE_1', 'GATE_START', 'INVENTORY', 'FINDINGS', 'CHALLENGE', 'BACKLOG', 'GATE_A'];
export const EXECUTION = ['TESTS', 'IMPLEMENT', 'REVIEW', 'FIX'];
export const DELIVERED = ['REPORT', 'GATE_2'];

// Has the owner given start permission? Tasks created before the start gate existed (SAT < 0.4.0) count as
// started once they reached TESTS or IMPLEMENT, which then followed the plan approval directly.
export function hasStarted(task) {
  return Boolean(task && (task.started || (task.history || []).some((h) => h.phase === 'TESTS' || h.phase === 'IMPLEMENT')));
}

// The badge line, chosen by the tool from the phase: an agent cannot claim a stage the task is not in.
export function stageOf(task) {
  const p = task && task.phase;
  if (PREPARATION.includes(p)) return { key: 'preparation', badge: '🟡 تحضير — لم يُعدَّل شيء في برنامجك بعد' };
  if (EXECUTION.includes(p)) return { key: 'execution', badge: '🔴 تنفيذ — الفريق يعدّل برنامجك الآن بإذنك' };
  if (DELIVERED.includes(p)) return { key: 'delivered', badge: '🟢 انتهى التنفيذ — التعديلات جاهزة، ولن تُعتمد إلا إذا دمجتها أنت' };
  if (p === 'ESCALATED')
    return hasStarted(task)
      ? { key: 'paused', badge: '⏸️ متوقف أثناء التنفيذ — بانتظار قرارك' }
      : { key: 'paused', badge: '⏸️ متوقف أثناء التحضير — لم يُعدَّل شيء في برنامجك، وبانتظار قرارك' };
  if (p === 'CLOSED') return { key: 'closed', badge: '✅ أُغلقت المهمة' };
  if (p === 'CANCELLED') return { key: 'cancelled', badge: '⛔ أُلغيت المهمة' };
  return { key: 'none', badge: '' };
}

const STEP_SIMPLE = {
  install: 'تثبيت المكتبات',
  typecheck: 'فحص سلامة الكود',
  lint: 'فحص جودة الكود',
  build: 'بناء البرنامج',
  test: 'الاختبارات الآلية',
  secrets: 'البحث عن كلمات سر مكشوفة',
  sast: 'الفحص الأمني للكود',
  dependencies: 'فحص ثغرات المكتبات',
};

// Labels for the owner-facing part of a document. "developer" keeps the technical names.
export function labels(audience) {
  const simple = audience !== 'developer';
  return {
    simple,
    sev: (s) => (simple ? { critical: 'خطير جداً', high: 'خطير', medium: 'متوسط', low: 'بسيط' } : { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' })[s] || s,
    proof: (p) => (simple ? { confirmed: 'ثبت بالتجربة', suspected: 'مشتبه، لم يُثبت بالتجربة' } : { confirmed: 'مؤكد', suspected: 'مشتبه' })[p] || p,
    priority: (p) => (simple ? { P0: 'عاجل جداً', P1: 'عاجل', P2: 'مهم', P3: 'لاحقاً' } : { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' })[p] || p,
    path: (p) => (simple ? { full: 'كامل (تصميم واختبارات وفحص أمني)', light: 'مختصر (تعديل صغير)' } : { full: 'كامل', light: 'خفيف' })[p] || p,
    step: (name) => (simple ? STEP_SIMPLE[name] || name : name),
    pr: simple ? 'طلب الدمج على GitHub' : 'PR',
    review: (v) =>
      simple
        ? { BLOCKED: 'وجد المراجع مشكلة خطيرة مؤكدة', CLEAR_WITHIN_SCOPE: 'لم يجد المراجع مشكلة خطيرة مؤكدة فيما فحصه' }[v] || 'لم تكتمل المراجعة'
        : v || 'غير متاح',
    security: (v) =>
      simple
        ? {
            BLOCKED: 'وجد المدقق الأمني ثغرة خطيرة مؤكدة',
            INCOMPLETE: 'لم يكتمل الفحص الأمني: بعض الجوانب لم تُختبر',
            CLEAR_WITHIN_SCOPE: 'لم تثبت ثغرة خطيرة فيما اختُبر — وهذا لا يعني أن البرنامج محصّن تماماً',
          }[v] || 'لم يكتمل الفحص الأمني'
        : v || 'غير متاح',
  };
}

// One line that tells the owner the exact reply, used by the tools' documents and by `phase status`.
export function replyLine(cfg, gate) {
  const key = GATE_PHRASE[gate];
  if (!key) return '';
  return `«${cfg.gates.phrases[key]}»`;
}

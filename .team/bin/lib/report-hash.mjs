// Marwan SAT — the only part of REPORT.md a human-facing agent may edit is the
// tech-manager risk section. Everything else is generated and hash-locked.
import { sha256 } from './proc.mjs';

export const TM_BEGIN = '<!-- sat:tm-risk:begin -->';
export const TM_END = '<!-- sat:tm-risk:end -->';
export const TM_PLACEHOLDER = '_(يكتبه المدير التقني: تقديره للمخاطر المتبقية، بلا إعادة لما سبق)_';

function split(text) {
  const t = text.replace(/\r\n/g, '\n');
  const a = t.indexOf(TM_BEGIN);
  const b = t.indexOf(TM_END);
  if (a < 0 || b < 0 || b < a) return null;
  return { before: t.slice(0, a + TM_BEGIN.length), inner: t.slice(a + TM_BEGIN.length, b), after: t.slice(b) };
}

export function reportHash(text) {
  const parts = split(text);
  if (!parts) return null;
  return sha256(`${parts.before}\n${TM_PLACEHOLDER}\n${parts.after}`);
}

export function tmSectionFilled(text) {
  const parts = split(text);
  if (!parts) return false;
  const inner = parts.inner.trim();
  return inner.length >= 20 && !inner.includes(TM_PLACEHOLDER);
}

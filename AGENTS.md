<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## قواعد مشروع باندا ستور

- **مشروع تجريبي:** يُبنى لتجربة Marwan SAT الأولى، ولا يُفتح لزبائن حقيقيين.
- **الدفع عند الاستلام فقط:** لا تُدمج أي بوابة دفع، ولا تُضاف مفاتيح دفع بأي صيغة.
- **البيانات اصطناعية:** لا أسماء ولا أرقام هواتف ولا عناوين حقيقية في الكود أو البيانات الأولية أو الاختبارات.
- **الواجهة عربية من اليمين إلى اليسار:** `lang="ar"` و`dir="rtl"` في الجذر.
- **المبالغ بالدينار العراقي أعداداً صحيحة (integer):** لا أعداد عشرية في الأسعار ولا المجاميع.
- **الأسرار في متغيرات البيئة فقط:** ملفات `.env*` لا تُرفع إلى المستودع.

# باندا ستور (Panda Store)

متجر إلكتروني تجريبي، يُبنى بفريق الوكلاء [Marwan SAT](https://github.com/marwan-ahmed/marwan-sat) ضمن تجربته الأولى.

> **ليس للاستخدام الحقيقي.** الدفع عند الاستلام فقط، والبيانات كلها اصطناعية. لا يُفتح لزبائن حقيقيين قبل تدقيق أمني كامل واختبار اختراق بشري.

## المتطلبات
- Node.js 22.12 أو أحدث (`node --version`).

## الأوامر

| الأمر | ما يفعله |
|---|---|
| `npm install` | يثبّت الاعتماديات |
| `npm run dev` | يشغّل المتجر محلياً على http://localhost:3000 |
| `npm test` | يشغّل الاختبارات (Vitest) |
| `npm run typecheck` | فحص الأنواع (TypeScript) |
| `npm run lint` | فحص جودة الكود (ESLint) |
| `npm run build` | بناء نسخة الإنتاج |

## المكدس
Next.js 16 (App Router، TypeScript) · Tailwind CSS 4 · Vitest مع React Testing Library.

---
task: TASK-002
change_request: CR-1
classification: clarification
---

# قرار المعماري في طلب التغيير — CR-1

- **التصنيف:** clarification (توضيح داخل النطاق)
- **السبب:**
  1. يُلزم معيار القبول `SPEC.md` (`AC-6` ← `EXEC_PROMPT.md` §3 `R9`) وعقد `src/components/cart-view.tsx#CartView` في `ARCH.md` §3 بعرض سعر الوحدة (`priceIqd`) والمجموع الفرعي للسطر (`lineSubtotalIqd`) والمجموع الكلي للسلة (`cartTotalIqd`) في آنٍ واحد داخل `/cart`.
  2. عند وجود سطر منتج واحد فقط في السلة، يتطابق نص المجموع الفرعي للسطر مع المجموع الكلي للسلة (ويتطابق معهما سعر الوحدة أيضاً عندما تكون الكمية `1`)، ولذلك يعرض `src/components/cart-view.tsx#CartView` النص نفسه بأمان في عناصر `<span>` مستقلة:
     - في `tests/cart-ui.test.tsx#AC-7` (المنتج `"1"` بسعر `15,000 د.ع` × كمية `2`) يظهر النص `"30,000 د.ع"` مرتين (`lineSubtotalIqd` و`cartTotalIqd`).
     - في `tests/cart-ui.test.tsx#AB-8` (المنتج `"1"` بسعر `15,000 د.ع` × كمية `1`) يظهر النص `"15,000 د.ع"` ثلاث مرات (`priceIqd` و`lineSubtotalIqd` و`cartTotalIqd`).
  3. اعتمدت الاختبارات الأخرى في الملف نفسه (`AC-3` و`AC-4` وتكملة `AC-7` عند المنتج `"2"` بكمية `1`) على `getAllByText(...).length` لتجاوز هذا التطابق الحتمي، بينما استخدمت حالتا `AC-7` (السطر 352 وقت كتابة القرار) و`AB-8` (السطر 527) الاستعلام المفرد `getByText(...)` الذي يرمي `TestingLibraryElementError` عند تعدد العناصر المطابقة.
  4. الخيار الثاني في `CHANGE_REQUEST-1.md` (إخفاء أحد الحقول عند التساوي) مرفوض لأنه يخالف `EXEC_PROMPT.md` `R9` و`SPEC.md` `AC-6` ويكسر اختبار `AC-6`، كما أن المسألة لا تمس الحسابات المالية ولا الصلاحيات ولا مخطط البيانات ولا النطاق.
- **ما عُدّل:** SPEC (لا تعديل — `AC-6` و`AC-7` متسقتان مع `R9`) · ARCH (لا تعديل — عقد `src/components/cart-view.tsx#CartView` محدد بدقة) · PLAN (لا تعديل — المهام `T1`..`T5` دون تغيير)
- **أثره على الاختبارات المجمّدة:**
  تعود المهمة إلى مرحلة `TESTS` لتوجيه `marwan-sat-test-author` بإجراء تعديل محصور في `tests/cart-ui.test.tsx` فقط ثم إنشاء commit تجميد جديد، مع حظر تعديل أي ملف في `src/` أو إضعاف أي اختبار:
  1. في `tests/cart-ui.test.tsx` داخل اختبار `AC-7` (عند `secondMount.getByText("30,000 د.ع")`): استبدال `getByText("30,000 د.ع")` بـ `expect(secondMount.getAllByText("30,000 د.ع").length).toBeGreaterThanOrEqual(2)` (للتحقق من ظهور المجموع الفرعي والمجموع الكلي معاً، أو `toBeGreaterThanOrEqual(1)` اتساقاً مع استعلام `"9,500 د.ع"` في الاختبار نفسه)، مع إبقاء تحقق اسم المنتج وعداد السلة `"2"` وحدث `storage` كما هي.
  2. في `tests/cart-ui.test.tsx` داخل اختبار `AB-8` (عند `view.getByText("15,000 د.ع")`): استبدال `getByText("15,000 د.ع")` بـ `expect(view.getAllByText("15,000 د.ع").length).toBeGreaterThanOrEqual(3)` (للتحقق من بقاء سعر الوحدة والمجموع الفرعي والمجموع الكلي على سعر الكتالوج المعتمد بعد رفض إدخال XSS، أو `toBeGreaterThanOrEqual(1)`)، مع إبقاء كافة تأكيدات منع XSS وغياب `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`searchParams` دون أي تغيير.
  3. مراجعة `TRACE.md` والتأكد من استمرار تغطية جميع `AC-1`..`AC-10` و`EC-1`..`EC-6` و`AB-1`..`AB-13`.

> clarification ← تعود المهمة إلى TESTS لتحديث الاختبارات المتأثرة ثم تجميد جديد.
> scope_change ← THREAT ثم البوابة 1 مجدداً.

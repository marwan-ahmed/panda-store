---
task: TASK-002
id: CR-1
phase: IMPLEMENT
---

# طلب تغيير — TASK-002 / CR-1

- **البند المتأثر:** `SPEC.md` AC-6 و AC-7 و `THREAT_MODEL.md` AB-8 / `tests/cart-ui.test.tsx` (`AC-7` و `AB-8`)
- **المشكلة:**
  تفشل حالتان في ملف الاختبارات المجمّدة `tests/cart-ui.test.tsx` (63 اختباراً ناجحاً و2 فاشلان من أصل 65 عند تشغيل `npm run test`) بسبب استخدام دالة الاستعلام المفردة `getByText(...)` بدلاً من `getAllByText(...).length` عند وجود سطر منتج واحد في `CartView` (`src/components/cart-view.tsx#CartView`):
  1. `tests/cart-ui.test.tsx` (`AC-7`, السطر 352): يختبر `secondMount.getByText("30,000 د.ع")` مع المنتج `"1"` (`15,000 د.ع` × كمية `2`). وبما أن `SPEC.md` AC-6 يُلزم بعرض المجموع الفرعي للسطر (`lineSubtotalIqd`: `30,000 د.ع`) والمجموع الكلي للسلة (`cartTotalIqd`: `30,000 د.ع`) في آنٍ واحد، يطابق الاستعلام عنصرَي `<span>` متطابقين ويرمي `TestingLibraryElementError: Found multiple elements with the text: 30,000 د.ع`.
  2. `tests/cart-ui.test.tsx` (`AB-8`, السطر 527): يختبر `view.getByText("15,000 د.ع")` مع المنتج `"1"` (`15,000 د.ع` × كمية `1`). وبما أن `SPEC.md` AC-6 يُلزم بعرض سعر الوحدة (`priceIqd`) والمجموع الفرعي (`lineSubtotalIqd`) والمجموع الكلي (`cartTotalIqd`) وكلها تساوي `"15,000 د.ع"`، يطابق الاستعلام 3 عناصر `<span>` ويرمي `TestingLibraryElementError: Found multiple elements with the text: 15,000 د.ع`.
  *(ملاحظة: الاختبارات نفسها في `tests/cart-ui.test.tsx` استخدمت `getAllByText(...).length` بنجاح لنفس السبب في `AC-3` و `AC-4` و `AC-7` السطر 367).*
- **الأثر إن لم يُعالَج:**
  لا يمكن تمرير `npm run test` و`verify.mjs` دون تعديل أحد الجانبين؛ فحذف أي من السعر أو المجموع الفرعي أو المجموع الكلي من `CartView` سيُخالف `SPEC.md` AC-6 ويكسر اختبار `AC-6` المجمّد نفسه.
- **الخيارات:**
  1. **(مُوصى به)** تحديث السطرين 352 و527 في `tests/cart-ui.test.tsx` (من قِبل مؤلف الاختبارات / مدير التقنية وفق مسار تعديل الاختبارات المجمّدة) لاستخدام `getAllByText("30,000 د.ع").length >= 1` (أو التحقق من `<span>` الخاص بالمجموع الكلي والمجموع الفرعي) و`getAllByText("15,000 د.ع").length >= 1` أسوةً ببقية الاختبارات في نفس الملف.
  2. تعديل `SPEC.md` AC-6 لإخفاء أحد الحقول المكررة عند تساويها، وهو خيار يغيّر متطلبات الواجهة المعلنة ويكسر اختبار `AC-6`.
- **يمس:** المال ☐ الصلاحيات ☐ مخطط البيانات ☐ النطاق ☐

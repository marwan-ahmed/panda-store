---
task: TASK-001
change_request: CR-1
classification: clarification
---

# قرار المعماري في طلب التغيير — CR-1

- **التصنيف:** `clarification` (توضيح داخل النطاق)
- **السبب:** يُلزم معيار W3C لملفات SVG المستقلة المقدَّمة بنوع `image/svg+xml` عبر `<img src="/images/products/...">` (كما يستخدمها `<Image unoptimized />` في `ProductCard` و`ProductDetails`) وجود إعلان مساحة الاسم القياسي `xmlns="http://www.w3.org/2000/svg"` في عنصر `<svg>` الجذري لكي تعرضها المتصفحات بدلاً من اعتبارها XML بلا مساحة اسم (صورة معطلة). هذا الإعلان معرِّف XML Namespace ثابت وليس رابطاً خارجياً أو طلب شبكة (`THREAT_MODEL.md` `AB-8` و`SPEC.md` `AC-9` يمنعان الروابط الخارجية `http://`/`https://`، ولا يمنعان إعلان `xmlns` القياسي). التعديل يوضّح هذا القيد داخل النطاق دون أي تغيير في النطاق أو المال أو الصلاحيات أو مخطط البيانات، وهو ضروري لتحقيق عرض الصور المحلية في `AC-5` و`AC-6`.
- **ما عُدّل:**
  - `SPEC.md`: توضيح `AC-9` وقيد الأصول في `§5` بأن ملفات `.svg` المحلية المستقلة (`image/svg+xml`) تتضمن إعلان مساحة الاسم القياسي `xmlns="http://www.w3.org/2000/svg"` على عنصر `<svg>` الجذري مع خلوها التام من أي روابط أو موارد شبكة خارجية (`http://` أو `https://`).
  - `ARCH.md`: توضيح جدول العقود (`§3`) وبند أمان SVG (`§5`) بأن الملفات العشرة تحت `public/images/products/product-01.svg` … `product-10.svg` هي رسومات `image/svg+xml` مستقلة تحمل `xmlns="http://www.w3.org/2000/svg"` على `<svg>` الجذري وتخلو تماماً من `<script>` ومعالجات `on*` و`<foreignObject>` و`javascript:` وأي مراجع `http://`/`https://` خارجية (`href`, `xlink:href`, `src`, `url(...)`).
  - `PLAN.md`: توضيح معيار الإنجاز للمهمة `T1` ليتضمن `xmlns="http://www.w3.org/2000/svg"` على الجذر مع استمرار حظر الروابط الخارجية؛ دون أي تغيير في `allowed_write` أو `TASKS.json`.
- **أثره على الاختبارات المجمّدة والتوجيه لكاتب الاختبارات (`TESTS`):**
  - يتطلب تحديث حالة `AB-8` في `tests/security-assets.test.ts` (مع الحفاظ على `tests/home.test.tsx` و`tests/products-domain.test.ts` و`tests/product-routes.test.tsx` و`THREAT_MODEL.md` و`TRACE.md` كما هي، ثم إنشاء commit تجميد جديد عبر `phase next`).
  - **التوجيه المحدد لكاتب الاختبارات في `tests/security-assets.test.ts` (`AB-8`، حول السطر 92):**
    1. التحقق صراحةً من وجود إعلان مساحة الاسم القياسي لـ SVG في وسم الفتح `<svg>` لكل ملف من الملفات العشرة:
       `expect(svgContent).toMatch(/<svg\b[^>]*\bxmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\1/i);`
    2. استبدال فحص `expect(svgContent).not.toMatch(/https?:\/\//i);` بإزالة هذا الإعلان المفرد وحده من وسم الفتح `<svg>` فقط (استبدال غير شامل non-global على `<svg ...>`) ثم التحقق من خلوّ بقية الملف تماماً من أي `http://` أو `https://` (بما يشمل `xmlns:xlink` أو `href` أو `src` أو `url(...)` أو أي تكرار آخر):
       ```ts
       const svgWithoutRootNs = svgContent.replace(
         /(<svg\b[^>]*?)\s+xmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\2/i,
         "$1"
       );
       expect(svgWithoutRootNs).not.toMatch(/https?:\/\//i);
       ```
    3. الإبقاء على جميع فحوصات `AB-8` الأخرى دون أي تخفيف (`validateProduct` لرفض المسارات غير المحلية، وحجم الملف `< 50KB` و`> 0`، و`<svg[\s>]/i`، ومنع `<script\b` و`\son[a-z]+\s*=` و`<foreignObject\b` و`javascript:`).

> `clarification` ← تعود المهمة إلى `TESTS` لتحديث الاختبارات المتأثرة ثم تجميد جديد.

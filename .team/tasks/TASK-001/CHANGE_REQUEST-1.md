---
task: TASK-001
id: CR-1
phase: IMPLEMENT
---

# طلب تغيير — TASK-001 / CR-1

- **البند المتأثر:** `tests/security-assets.test.ts` (`AB-8`، السطر 92) / `TASKS.json` (`T1`) / `SPEC.md` (`AC-5`، `AC-6`) / `ARCH.md` (§3، §5)
- **المشكلة:** الاختبار المجمّد `tests/security-assets.test.ts` في حالة `AB-8` يفحص محتوى كل ملف من ملفات الصور العشرة (`public/images/products/product-01.svg` … `product-10.svg`) بالتعبير النمطي `expect(svgContent).not.toMatch(/https?:\/\//i);` (السطر 92). غير أن معيار W3C لملفات SVG المستقلة المقدَّمة بنوع `image/svg+xml` عبر `<img src="/images/products/...">` (والذي يعتمد عليه `<Image unoptimized />` في `ProductCard` و`ProductDetails`) يشترط وجود تعريف مساحة الاسم `xmlns="http://www.w3.org/2000/svg"` في عنصر `<svg>` الجذري لكي تعرضها المتصفحات بدلاً من اعتبارها XML بلا مساحة اسم (صورة معطلة). وهذا التعريف القياسي يحتوي حرفياً على `http://`، ما يؤدي إلى فشل الاختبار المجمّد تلقائياً عند وجود `xmlns="http://www.w3.org/2000/svg"`.
- **الأثر إن لم يُعالَج:** إما أن تفشل الاختبارات الآلية في `tests/security-assets.test.ts` إذا كُتبت ملفات SVG صالحة بـ `xmlns="http://www.w3.org/2000/svg"`، وإما أن تُنشأ ملفات SVG بدون `xmlns` فتنجح في الاختبار النصي لكنها لا تظهر كصور فعلية في المتصفح عند فتح `/` أو `/products/[id]`، ما يخلّ بـ `AC-5` و`AC-6`.
- **الخيارات:**
  1. تعديل فحص `AB-8` في `tests/security-assets.test.ts` (من قِبل كاتب الاختبارات/المدير التقني) ليستثني إعلان مساحة الاسم القياسي `xmlns="http://www.w3.org/2000/svg"` مع الإبقاء على منع أي روابط `http://` أو `https://` خارجية أخرى (مثل `href` أو `src` أو `url(...)`).
  2. الإبقاء على الاختبار كما هو وحذف `xmlns="http://www.w3.org/2000/svg"` من ملفات SVG (غير موصى به لأن المتصفحات لا تعرض ملفات `image/svg+xml` المستقلة داخل `<img>` بدون `xmlns`).
- **يمس:** المال ☐ الصلاحيات ☐ مخطط البيانات ☐ النطاق ☐

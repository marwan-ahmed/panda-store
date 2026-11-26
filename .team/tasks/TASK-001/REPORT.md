# تقرير المهمة — TASK-001: كتالوج منتجات باندا ستور وتفاصيلها

> 🟢 انتهى التنفيذ — التعديلات جاهزة، ولن تُعتمد إلا إذا دمجتها أنت
>
> هذا التقرير جزآن: **الأول لك** لتتخذ القرار، **والثاني للمبرمج** (الملفات والسجلات). مولَّد آلياً بأداة `report.mjs`، إلا القسم 5. أي تعديل يدوي على الأقسام المولّدة يُبطل التقرير.

# الجزء الأول: لك

## 1. القرار المطلوب منك
- مشكلة متوسطة وجدها المراجع: عند طلب رابط المنتجات ومعه شرطة مائلة في نهايته، يوجّه الخادم الطلب أولاً إلى الرابط نفسه بدون شرطة مائلة ثم يعرض صفحة «المنتج غير موجود» بدلاً من عرضها من الخطوة الأولى — هل نصلحها الآن، أم تقبل بقاءها؟ (REV-01)
- **لقبول ما سبق** اكتب حرفياً: «اعتمد النتيجة»، ثم اضغط **Merge** في طلب الدمج على GitHub (رابطه في رسالة المدير التقني). هنا لا يكفي الدمج وحده: قبولك المكتوب يُسجَّل في سجل المهمة.
- **لطلب تعديل** اكتب: «عدّل: …» مع ما تريد. **وللإلغاء:** «ألغِ المهمة».
- أي رد غير ذلك لا يُعدّ اعتماداً.

## 2. طلبك كما كتبته
> مهمة جديدة: أريد صفحة كتالوج لمتجر باندا ستور: قائمة بعشرة منتجات من بيانات ثابتة اصطناعية، لكل منتج اسم وسعر بالدينار العراقي وصورة ووصف، وصفحة تفاصيل لكل منتج. لا سلة ولا دفع ولا تسجيل دخول في هذه المهمة.

## 3. ماذا أُنجز، باختصار
**الأعمال التي نُفّذت:**
- Create 10 synthetic local SVG product illustrations
- Implement static synthetic catalog, validation, and IQD price formatting
- Build reusable Arabic RTL product card, details, and not-found UI components
- Replace home page placeholder with the 10-product catalog on /
- Implement product details route, Arabic 404 routes, and pre-stream 404 proxy guard

**النتيجة:**
- عدد الملفات التي تغيّرت في برنامجك: 24 (أسماؤها في القسم 7).
- الفحص الآلي للبرنامج: **نجح**.
- المراجعة: لم يجد المراجع مشكلة خطيرة مؤكدة فيما فحصه.
- الفحص الأمني: لم تثبت ثغرة خطيرة فيما اختُبر — وهذا لا يعني أن البرنامج محصّن تماماً.

## 4. ما لم يُنجز أو فشل أو لم يُختبر
- الفحص الآلي «البحث عن كلمات سر مكشوفة»: الأداة غير مثبتة
- الفحص الآلي «الفحص الأمني للكود»: الأداة غير مثبتة

## 5. تقدير المخاطر (يكتبه المدير التقني)
<!-- sat:tm-risk:begin -->
- **الأثر العملي للملاحظة المتوسطة المتبقية:** أثرها محدود جداً في الاستخدام الفعلي؛ لأن المتصفح يتبع التحويل تلقائياً ويعرض للزائر صفحة «المنتج غير موجود» العربية فوراً دون خطأ، ولا يظهر الفرق إلا في أدوات الفحص التي لا تتبع التحويلات. لذلك يُعدّ قبولها آمناً في هذه المرحلة التجريبية إن أردت إغلاق المهمة الآن.
- **طبقة التقوية الأمنية المؤجلة:** غياب ترويسات الحماية الإضافية على استجابات المتجر لا يمثّل خطراً مباشراً الآن لأن المتجر تجريبي للعرض فقط دون حسابات أو دفع أو رفع ملفات، لكننا نوصي بمهمة تقوية منفصلة لإضافتها قبل أي نشر عام للجمهور.
- **حدود الفحص المحلي:** لم تُشغَّل أداتا «البحث عن كلمات سر مكشوفة» و«الفحص الأمني للكود» محلياً لعدم تثبيتهما على هذا الجهاز؛ غطّت المراجعة اليدوية والفحص المباشر للنسخة المبنية هذا الجانب ضمن النطاق، ويبقى الفحص الآلي الكامل على GitHub في طلب الدمج هو المرجع الإضافي قبل الدمج.
<!-- sat:tm-risk:end -->

# الجزء الثاني: التفاصيل التقنية (للمبرمج)

> المسار: كامل · الفرع: `sat/TASK-001` · HEAD: `742f2e12b4` · PR: يفتحه SAT عند الانتقال إلى البوابة 2

## 6. الهدف كما صاغه مفسّر الطلب (EXEC_PROMPT §1)
عرض قائمة الكتالوج التي تضم عشرة منتجات من بيانات ثابتة اصطناعية مباشرةً في الصفحة الرئيسية لمتجر «باندا ستور» محل عبارة «المتجر قيد البناء»، مع إظهار الاسم والسعر الواحد الثابت بالدينار العراقي والصورة والوصف لكل منتج، وإتاحة صفحة تفاصيل مستقلة لكل منتج، دون سلة تسوق أو دفع أو تسجيل دخول في هذه المرحلة.

## 7. ما تغيّر
```text
 .team/DECISIONS.md                           |  31 +++
 .team/LEDGER.jsonl                           |  12 +
 .team/tasks/TASK-001/ANSWERS.md              |   8 +
 .team/tasks/TASK-001/ARCH.md                 | 105 +++++++++
 .team/tasks/TASK-001/CHANGE_DECISION-1.md    |  30 +++
 .team/tasks/TASK-001/CHANGE_REQUEST-1.md     |  15 ++
 .team/tasks/TASK-001/EXEC_PROMPT.md          | 118 ++++++++++
 .team/tasks/TASK-001/IMPLEMENTATION_NOTES.md |  13 ++
 .team/tasks/TASK-001/PLAN.md                 |  12 +
 .team/tasks/TASK-001/REQUEST.md              |   1 +
 .team/tasks/TASK-001/SPEC.md                 |  39 ++++
 .team/tasks/TASK-001/TASKS.json              |  76 +++++++
 .team/tasks/TASK-001/THREAT_MODEL.md         |  92 ++++++++
 .team/tasks/TASK-001/TRACE.md                |  32 +++
 .team/tasks/TASK-001/task.json               | 123 +++++++++++
 public/images/products/product-01.svg        |  19 ++
 public/images/products/product-02.svg        |  20 ++
 public/images/products/product-03.svg        |  17 ++
 public/images/products/product-04.svg        |  19 ++
 public/images/products/product-05.svg        |  17 ++
 public/images/products/product-06.svg        |  18 ++
 public/images/products/product-07.svg        |  20 ++
 public/images/products/product-08.svg        |  20 ++
 public/images/products/product-09.svg        |  26 +++
 public/images/products/product-10.svg        |  17 ++
 src/app/not-found.tsx                        |  14 ++
 src/app/page.tsx                             |  29 ++-
 src/app/products/[id]/not-found.tsx          |   8 +
 src/app/products/[id]/page.tsx               |  48 ++++
 src/app/products/page.tsx                    |   8 +
 src/components/not-found-view.tsx            |  25 +++
 src/components/product-card.tsx              |  49 ++++
 src/components/product-details.tsx           |  52 +++++
 src/lib/products.ts                          | 235 ++++++++++++++++++++
 src/proxy.ts                                 |  30 +++
 tests/home.test.tsx                          | 127 ++++++++++-
 tests/product-routes.test.tsx                | 319 +++++++++++++++++++++++++++
 tests/products-domain.test.ts                | 236 ++++++++++++++++++++
 tests/security-assets.test.ts                | 153 +++++++++++++
 39 files changed, 2226 insertions(+), 7 deletions(-)
```

| المهمة | العنوان | معايير القبول | حالات الإساءة | الملفات المسموحة |
|---|---|---|---|---|
| T1 | Create 10 synthetic local SVG product illustrations | AC-3, AC-5, AC-6, AC-9 | AB-8, AB-10, AB-11 | `public/images/products/product-01.svg`, `public/images/products/product-02.svg`, `public/images/products/product-03.svg`, `public/images/products/product-04.svg`, `public/images/products/product-05.svg`, `public/images/products/product-06.svg`, `public/images/products/product-07.svg`, `public/images/products/product-08.svg`, `public/images/products/product-09.svg`, `public/images/products/product-10.svg` |
| T2 | Implement static synthetic catalog, validation, and IQD price formatting | AC-2, AC-3, AC-4, AC-6, AC-7 | AB-4, AB-5, AB-6, AB-8, AB-9, AB-11 | `src/lib/products.ts` |
| T3 | Build reusable Arabic RTL product card, details, and not-found UI components | AC-1, AC-3, AC-5, AC-6, AC-7, AC-8, AC-9 | AB-2, AB-3, AB-5, AB-7, AB-8, AB-9 | `src/components/product-card.tsx`, `src/components/product-details.tsx`, `src/components/not-found-view.tsx` |
| T4 | Replace home page placeholder with the 10-product catalog on / | AC-1, AC-2, AC-5, AC-8, AC-9 | AB-2, AB-3, AB-5 | `src/app/page.tsx` |
| T5 | Implement product details route, Arabic 404 routes, and pre-stream 404 proxy guard | AC-6, AC-7, AC-8, AC-9 | AB-1, AB-2, AB-3, AB-6, AB-7, AB-9, AB-10, AB-11 | `src/app/products/[id]/page.tsx`, `src/app/products/[id]/not-found.tsx`, `src/app/products/page.tsx`, `src/app/not-found.tsx`, `src/proxy.ts` |

## 8. التحقق
آخر تشغيل: `.team/tasks/TASK-001/evidence/20261126-192242-742f2e1` على `742f2e12b4` — **نجاح**

نطاق الماسحات: **التغيير وحده مقارنةً بـ `aed68934fd`** (الميثاق §9.6)

| الخطوة | الحالة | رمز الخروج | السجل |
|---|---|---|---|
| install | نجح | 0 | `.team/tasks/TASK-001/evidence/20261126-192242-742f2e1/install.log` |
| typecheck | نجح | 0 | `.team/tasks/TASK-001/evidence/20261126-192242-742f2e1/typecheck.log` |
| lint | نجح | 0 | `.team/tasks/TASK-001/evidence/20261126-192242-742f2e1/lint.log` |
| build | نجح | 0 | `.team/tasks/TASK-001/evidence/20261126-192242-742f2e1/build.log` |
| test | نجح | 0 | `.team/tasks/TASK-001/evidence/20261126-192242-742f2e1/test.log` |
| secrets | الأداة غير مثبتة | — | — |
| sast | الأداة غير مثبتة | — | — |
| dependencies | نجح | 0 | `.team/tasks/TASK-001/evidence/20261126-192242-742f2e1/dependencies.log` |
| check:managed_files | نجح | — | unchanged |
| check:tests_frozen | نجح | — | unchanged since 8611703 |
| check:allowed_write | نجح | — | all changes within allowed_write |

نتيجة CI على PR هي المرجع النهائي (الميثاق §8.1).

تغطية TRACE: 20 من 20 معرّفاً (معايير القبول وحالات الإساءة).

## 9. المراجعة والتدقيق الأمني
- حكم المراجع: **CLEAR_WITHIN_SCOPE**
- حكم المدقق الأمني: **CLEAR_WITHIN_SCOPE** (CLEAR_WITHIN_SCOPE تعني: لم تثبت ثغرة Critical/High ضمن ما اختُبر فعلاً، لا أن النظام آمن)
- دورات الإصلاح: 0

| المعرّف | المصدر | الخطورة | الإثبات | الموقع | السيناريو / الإصلاح |
|---|---|---|---|---|---|
| REV-01 | المراجع | Medium | مؤكد | src/proxy.ts#proxy | تنص المواصفات (EC-4) والمعمارية على أن المسار /products/ يعيد HTTP 404 مباشرةً عبر src/proxy.ts#proxy؛ غير أن اختبار خادم الإنتاج الفعلي (Next.js 16.4.6 عبر next start مع الإعداد الافتراضي skipTrailingSlashRedirect: false) يكشف أن موجه Next.js يلتقط الشرطة المائلة الختامية قبل وصول الطلب إلى proxy.ts، فيرد على GET /products/ برمز 308 Permanent Redirect نحو Location: /products (وليس 404 مباشرةً)، وكذلك يرد على GET /products/3/ برمز 308 نحو /products/3. وعند عدم اتباع التحويلات (مثل redirect: "manual") لا يرى العميل رمز 404 من الاستجابة الأولى، بينما مرّ اختبار EC-4 في tests/product-routes.test.tsx لأنه يستدعي proxy() مباشرةً في Vitest متجاوزاً طبقة التوجيه هذه. ← يعتمد السلوك على طبقة التوجيه في Next.js 16.4.6 حيث يسبق توحيد الشرطة المائلة الافتراضي (skipTrailingSlashRedirect: false) تنفيذ src/proxy.ts#proxy: إما توثيق قبول تسلسل 308 -> /products -> 404 في EC-4 وARCH.md (إذ تصل المتصفحات والعملاء المتبعون للتحويل إلى صفحة 404 العربية بنجاح)، أو تفعيل skipTrailingSlashRedirect: true في next.config.ts شريطة تعديل src/proxy.ts#proxy أيضاً لإعادة توجيه المسارات الصالحة المنتهية بشرطة مائلة (مثل /products/3/) إلى /products/3 بدلاً من إسقاطها إلى 404. |
| SEC-01 | المدقق الأمني | Low | مؤكد | next.config.ts#nextConfig | لا تضيف تهيئة Next.js الحالية ترويسات الحماية الثابتة (X-Content-Type-Options وContent-Security-Policy وX-Frame-Options وReferrer-Policy) على استجابات HTML أو ملفات SVG المستقلة، كما تُرسل ترويسة X-Powered-By: Next.js على الصفحات. وفي ظل خلو النطاق الحالي من الجلسات والنماذج والرفع وخلو ملفات SVG العشرة من السكربتات (AB-8)، لا يوجد أثر استغلالي مباشر الآن، لكنها طبقة تقوية دفاعية مطلوبة قبل أي نشر عام. ← في مهمة تقوية لاحقة (لأن next.config.ts خارج نطاق ملفات TASK-001، وبمراعاة أن cacheComponents: true وpartialPrefetching: true لا يناسبهما CSP معتمد على nonce للصفحات الثابتة)، أضف دالة headers() ثابتة في next.config.ts تتضمن X-Content-Type-Options: nosniff وReferrer-Policy: strict-origin-when-cross-origin وX-Frame-Options: DENY (وContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline' لمسار /images/products/:path*) واضبط poweredByHeader: false. |

| المحور الأمني | التغطية | السبب |
|---|---|---|
| access_control | TESTED_DYNAMIC | اختُبرت مسارات / و/products/1..10 و/products و/products/99 و/products/1/extra واجتياز المسارات وطلبات RSC وPOST Next-Action و/api/* و/cart و/checkout و/admin ديناميكياً على الخادم المحلي؛ لا توجد أدوار أو مستأجرون في هذا النطاق العام للقراءة فقط. |
| authentication | TESTED_DYNAMIC | تم التحقق ديناميكياً من غياب Set-Cookie وإرجاع 404 لمسارات /login و/signup و/account و/api/auth/session وثبات الاستجابة مع ترويسات Cookie/Authorization/X-User-Role المزورة، وبالمراجعة الساكنة لعدم استدعاء cookies(). |
| injection | TESTED_DYNAMIC | اختُبرت ديناميكياً مفاتيح Object.prototype (__proto__ وconstructor وtoString) وحمولات XSS الخام والمشفّرة والترميز التالف (%E0%A4%A و%) واستعلامات URL، وجميع ملفات SVG العشرة، ورفض /_next/image لـ SVG بحالة 400، مع فحص validateProduct. |
| business_logic | TESTED_DYNAMIC | تم التحقق من الاستجابات الحية على / و/products/1..10 لعرض 10 منتجات فقط بأسعار أعداد صحيحة موجبة بالدينار العراقي دون خصومات أو ضرائب أو رسوم توصيل، إضافة إلى فحص دوال التحقق validatePriceIqd وformatPriceIqd وvalidateCatalog. |
| mass_assignment_data_exposure | TESTED_DYNAMIC | تم التحقق من استجابات 200 و404 وRSC الحية لعدم كشف أي مسارات داخلية أو تتبع أخطاء أو بيانات شخصية أو حقول غير مصرح بها، إضافة إلى فحص إسقاط الحقول الإضافية في validateProduct. |
| resource_abuse_uploads | TESTED_DYNAMIC | اختُبرت المسارات العميقة والمعرف بطول 4096 محرفاً وحقن معاملات الاستعلام ودفعة 50 طلباً (243 مللي ثانية، 50x 404) ومحاولة POST /api/upload؛ لا توجد أي نقاط رفع ملفات في التطبيق. |
| configuration_secrets_supply_chain | TESTED_DYNAMIC | اختُبرت ترويسات الاستجابة وحقن Host/X-Forwarded-Host/Origin ديناميكياً على الخادم المحلي، مع مراجعة next.config.ts وpackage.json وحزم العميل التسع في .next/static/chunks/ ونتيجة npm audit (0 vulnerabilities في dependencies.log؛ بينما gitleaks وsemgrep غير مثبتتين). |

## 10. الاستهلاك
- الزمن منذ فتح المهمة: 4.0 ساعة
- مرات تشغيل verify: 3
- دورات الإصلاح: 0
- التكلفة (AI Credits): غير مسجّلة آلياً

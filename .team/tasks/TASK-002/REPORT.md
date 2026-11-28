# تقرير المهمة — TASK-002: سلة التسوق وحساب المجموع بالدينار العراقي

> 🟢 انتهى التنفيذ — التعديلات جاهزة، ولن تُعتمد إلا إذا دمجتها أنت
>
> هذا التقرير جزآن: **الأول لك** لتتخذ القرار، **والثاني للمبرمج** (الملفات والسجلات). مولَّد آلياً بأداة `report.mjs`، إلا القسم 5. أي تعديل يدوي على الأقسام المولّدة يُبطل التقرير.

# الجزء الأول: لك

## 1. القرار المطلوب منك
- مشكلة متوسطة وجدها المراجع: قد تبقى رسالة تنبيه أو رقم غير مكتمل ظاهرَين للزائر عند عودته إلى صفحة السلة بعد التنقل إلى صفحة أخرى — هل نصلحها الآن، أم تقبل بقاءها؟ (REV-01)
- **لقبول ما سبق** اكتب حرفياً: «اعتمد النتيجة»، ثم اضغط **Merge** في طلب الدمج على GitHub (رابطه في رسالة المدير التقني). هنا لا يكفي الدمج وحده: قبولك المكتوب يُسجَّل في سجل المهمة.
- **لطلب تعديل** اكتب: «عدّل: …» مع ما تريد. **وللإلغاء:** «ألغِ المهمة».
- أي رد غير ذلك لا يُعدّ اعتماداً.

## 2. طلبك كما كتبته
> إضافة سلة التسوق (الاقتراح الأفضل للخطوة التالية): إتاحة إضافة المنتجات إلى السلة، وتعديل الكميات، وحذف المنتجات، وحساب المجموع الإجمالي بالدينار العراقي (أعداد صحيحة دون كسور)، قبل الانتقال لاحقاً إلى خطوة إتمام الطلب بالدفع عند الاستلام فقط.

## 3. ماذا أُنجز، باختصار
**الأعمال التي نُفّذت:**
- Implement pure cart domain logic, quantity validation, catalog-backed pricing, and IQD total formatting
- Implement bounded browser storage sanitization, useSyncExternalStore cart store, and CartProvider
- Build reusable Arabic RTL cart UI components (AddToCartButton, SiteHeader, CartHeaderLink, CartView)
- Wire AddToCartButton into ProductCard and ProductDetails
- Mount CartProvider and SiteHeader in RootLayout and create the independent /cart route

**النتيجة:**
- عدد الملفات التي تغيّرت في برنامجك: 17 (أسماؤها في القسم 7).
- الفحص الآلي للبرنامج: **نجح**.
- المراجعة: لم يجد المراجع مشكلة خطيرة مؤكدة فيما فحصه.
- الفحص الأمني: لم تثبت ثغرة خطيرة فيما اختُبر — وهذا لا يعني أن البرنامج محصّن تماماً.

## 4. ما لم يُنجز أو فشل أو لم يُختبر
- الفحص الآلي «البحث عن كلمات سر مكشوفة»: الأداة غير مثبتة
- الفحص الآلي «الفحص الأمني للكود»: الأداة غير مثبتة

## 5. تقدير المخاطر (يكتبه المدير التقني)
<!-- sat:tm-risk:begin -->
- **الأثر العملي للملاحظة المتوسطة المتبقية:** أثرها بصري ومحدود جداً؛ إذ قد يبقى نص غير مكتمل أو رسالة تنبيه قديمة ظاهرةً في صفحة السلة إذا غادر الزائر الصفحة وعاد إليها مباشرة، لكنها لا تؤثر أبداً على الكميات المحفوظة ولا على صحة حساب المجموع بالدينار العراقي، وتختفي فور أي تعديل أو تحديث للصفحة. يمكنك قبولها الآن لإغلاق المهمة، أو طلب إصلاحها السريع قبل الدمج.
- **الملاحظات البسيطة المؤجلة:** رُصدت حالات برمجية حدية بسيطة لا يمكن للزائر الوصول إليها عبر واجهة المتجر أو بيانات المتصفح، كما تستمر التوصية السابقة بمهمة تقوية أمنية منفصلة لإضافة ترويسات الحماية الثابتة للخادم قبل أي نشر عام للجمهور.
- **حدود الفحص المحلي:** لم تُشغَّل أداتا «البحث عن كلمات سر مكشوفة» و«الفحص الأمني للكود» محلياً لعدم تثبيتهما على هذا الجهاز؛ وغطّى الفحص اليدوي وفحص الحزم المبنية والتجربة المباشرة هذا الجانب، ويبقى الفحص الآلي الكامل على GitHub في طلب الدمج هو الضامن الإضافي قبل الاعتماد.
<!-- sat:tm-risk:end -->

# الجزء الثاني: التفاصيل التقنية (للمبرمج)

> المسار: كامل · الفرع: `sat/TASK-002` · HEAD: `4bb7d48a50` · PR: يفتحه SAT عند الانتقال إلى البوابة 2

## 6. الهدف كما صاغه مفسّر الطلب (EXEC_PROMPT §1)
إضافة سلة تسوق إلى متجر «باندا ستور» التجريبي تتيح للزائر إضافة المنتجات من الكتالوج المعتمد، وحفظ محتوياتها في متصفح الزائر نفسه، وعرضها في صفحة مستقلة خاصة بالسلة لتعديل كمياتها وحذفها، وحساب المجاميع الفرعية والمجموع الإجمالي بالدينار العراقي أعداداً صحيحة دون كسور، وذلك تمهيداً لإضافة خطوة إتمام الطلب بالدفع عند الاستلام فقط في مهمة لاحقة.

## 7. ما تغيّر
```text
 .team/DECISIONS.md                           |  25 ++
 .team/LEDGER.jsonl                           |  12 +
 .team/tasks/TASK-002/ANSWERS.md              |   7 +
 .team/tasks/TASK-002/ARCH.md                 | 126 ++++++
 .team/tasks/TASK-002/CHANGE_DECISION-1.md    |  25 ++
 .team/tasks/TASK-002/CHANGE_REQUEST-1.md     |  20 +
 .team/tasks/TASK-002/EXEC_PROMPT.md          | 126 ++++++
 .team/tasks/TASK-002/IMPLEMENTATION_NOTES.md |  19 +
 .team/tasks/TASK-002/PLAN.md                 |  12 +
 .team/tasks/TASK-002/REQUEST.md              |   1 +
 .team/tasks/TASK-002/SPEC.md                 |  41 ++
 .team/tasks/TASK-002/TASKS.json              |  68 +++
 .team/tasks/TASK-002/THREAT_MODEL.md         | 105 +++++
 .team/tasks/TASK-002/TRACE.md                |  45 ++
 .team/tasks/TASK-002/task.json               | 123 ++++++
 src/app/cart/page.tsx                        |  14 +
 src/app/layout.tsx                           |   9 +-
 src/components/add-to-cart-button.tsx        |  79 ++++
 src/components/cart-header-link.tsx          |  23 +
 src/components/cart-provider.tsx             |  20 +
 src/components/cart-view.tsx                 | 264 +++++++++++
 src/components/product-card.tsx              |   6 +-
 src/components/product-details.tsx           |   4 +
 src/components/site-header.tsx               |  24 +
 src/lib/cart-storage.ts                      | 218 +++++++++
 src/lib/cart-store.ts                        | 303 +++++++++++++
 src/lib/cart.ts                              | 506 +++++++++++++++++++++
 tests/cart-domain.test.ts                    | 479 ++++++++++++++++++++
 tests/cart-storage.test.ts                   | 416 +++++++++++++++++
 tests/cart-ui.test.tsx                       | 637 +++++++++++++++++++++++++++
 tests/home.test.tsx                          |   5 +-
 tests/security-assets.test.ts                |   2 +-
 32 files changed, 3758 insertions(+), 6 deletions(-)
```

| المهمة | العنوان | معايير القبول | حالات الإساءة | الملفات المسموحة |
|---|---|---|---|---|
| T1 | Implement pure cart domain logic, quantity validation, catalog-backed pricing, and IQD total formatting | AC-2, AC-3, AC-4, AC-5, AC-8 | AB-3, AB-4, AB-5, AB-6, AB-7, AB-9, AB-13 | `src/lib/cart.ts` |
| T2 | Implement bounded browser storage sanitization, useSyncExternalStore cart store, and CartProvider | AC-1, AC-7, AC-8, AC-9, AC-10 | AB-2, AB-3, AB-4, AB-7, AB-8, AB-9, AB-10, AB-11, AB-12, AB-13 | `src/lib/cart-storage.ts`, `src/lib/cart-store.ts`, `src/components/cart-provider.tsx` |
| T3 | Build reusable Arabic RTL cart UI components (AddToCartButton, SiteHeader, CartHeaderLink, CartView) | AC-1, AC-3, AC-4, AC-6, AC-9, AC-10 | AB-1, AB-2, AB-3, AB-4, AB-5, AB-6, AB-8, AB-9, AB-10, AB-11, AB-12, AB-13 | `src/components/add-to-cart-button.tsx`, `src/components/cart-header-link.tsx`, `src/components/site-header.tsx`, `src/components/cart-view.tsx` |
| T4 | Wire AddToCartButton into ProductCard and ProductDetails | AC-1, AC-2, AC-9, AC-10 | AB-1, AB-8, AB-12, AB-13 | `src/components/product-card.tsx`, `src/components/product-details.tsx` |
| T5 | Mount CartProvider and SiteHeader in RootLayout and create the independent /cart route | AC-1, AC-6, AC-7, AC-9, AC-10 | AB-1, AB-2, AB-8, AB-10, AB-12, AB-13 | `src/app/layout.tsx`, `src/app/cart/page.tsx` |

## 8. التحقق
آخر تشغيل: `.team/tasks/TASK-002/evidence/20261128-073631-4bb7d48` على `4bb7d48a50` — **نجاح**

نطاق الماسحات: **التغيير وحده مقارنةً بـ `8ba4d2682f`** (الميثاق §9.6)

| الخطوة | الحالة | رمز الخروج | السجل |
|---|---|---|---|
| install | نجح | 0 | `.team/tasks/TASK-002/evidence/20261128-073631-4bb7d48/install.log` |
| typecheck | نجح | 0 | `.team/tasks/TASK-002/evidence/20261128-073631-4bb7d48/typecheck.log` |
| lint | نجح | 0 | `.team/tasks/TASK-002/evidence/20261128-073631-4bb7d48/lint.log` |
| build | نجح | 0 | `.team/tasks/TASK-002/evidence/20261128-073631-4bb7d48/build.log` |
| test | نجح | 0 | `.team/tasks/TASK-002/evidence/20261128-073631-4bb7d48/test.log` |
| secrets | الأداة غير مثبتة | — | — |
| sast | الأداة غير مثبتة | — | — |
| dependencies | نجح | 0 | `.team/tasks/TASK-002/evidence/20261128-073631-4bb7d48/dependencies.log` |
| check:managed_files | نجح | — | unchanged |
| check:tests_frozen | نجح | — | unchanged since 4bb7d48 |
| check:allowed_write | نجح | — | all changes within allowed_write |

نتيجة CI على PR هي المرجع النهائي (الميثاق §8.1).

تغطية TRACE: 23 من 23 معرّفاً (معايير القبول وحالات الإساءة).

## 9. المراجعة والتدقيق الأمني
- حكم المراجع: **CLEAR_WITHIN_SCOPE**
- حكم المدقق الأمني: **CLEAR_WITHIN_SCOPE** (CLEAR_WITHIN_SCOPE تعني: لم تثبت ثغرة Critical/High ضمن ما اختُبر فعلاً، لا أن النظام آمن)
- دورات الإصلاح: 0

| المعرّف | المصدر | الخطورة | الإثبات | الموقع | السيناريو / الإصلاح |
|---|---|---|---|---|---|
| REV-01 | المراجع | Medium | مؤكد | src/components/cart-view.tsx#CartView | عند تفعيل cacheComponents في Next.js 16، يبقي الغلاف <Activity mode="hidden"> حالة React المحلية للمسار /cart عند التنقل منه إلى صفحة أخرى ثم العودة إليه، مع تشغيل تنظيف useLayoutEffect فقط. وبما أن CartView لا ينفذ تنظيف useLayoutEffect لحالتي alertMessage وdraftQuantities (بخلاف AddToCartButton)، فإن إدخال قيمة غير صالحة مثل "abc" أو بلوغ الحد الأقصى 99 وظهور التنبيه ثم إخفاء المكوّن عبر <Activity mode="hidden"> وإظهاره مجدداً بـ <Activity mode="visible"> يُبقي رسالة التنبيه (role="alert") والمسودة "abc" ظاهرتين في الواجهة. ← إضافة useLayoutEffect مع دالة تنظيف في src/components/cart-view.tsx#CartView لإعادة ضبط alertMessage إلى null وdraftQuantities إلى {} عند الإخفاء أو التفكيك، مع الاعتماد على بيئة React 19.3.0 وNext.js 16.4.6 المفعّل فيها cacheComponents: true. |
| REV-02 | المراجع | Low | مؤكد | src/lib/cart.ts#formatCartTotalIqd | تتحقق formatCartTotalIqd من typeof totalIqd === "number" وNumber.isSafeInteger(totalIqd) وtotalIqd >= 0، لكن الصفر السالب (-0) في JavaScript يجتاز هذه الشروط (Number.isSafeInteger(-0) === true و -0 < 0 === false)، فيمر إلى Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(-0) وينتج النص "-0 د.ع" بدلاً من "0 د.ع" أو رفضه. هذه الحالة غير قابلة للوصول من buildCart أو localStorage أو واجهة السلة لأن المجاميع تبدأ من +0 وتجمع قيماً موجبة فقط، وتحدث فقط عند استدعاء formatCartTotalIqd(-0) برمجياً. ← تطبيع الصفر السالب قبل التنسيق (const normalized = totalIqd === 0 ? 0 : totalIqd) أو رفض Object.is(totalIqd, -0) في src/lib/cart.ts#formatCartTotalIqd، وذلك في بيئة Node.js >=22.12.0 / ICU الحالية. |
| REV-03 | المراجع | Low | مؤكد | src/lib/cart.ts#sanitizeCartItems | تقرأ sanitizeCartItems الخاصية record.quantity مرتين (الأولى في isValidQuantityNumber(record.quantity) والثانية في currentQty + record.quantity). عند تمرير كائن JavaScript يحمل getter متغيّراً يعيد 1 في القراءة الأولى و-50 في القراءة الثانية، ينجح التحقق الأول ثم تُحسب الكمية -50 وتُحفظ في CartItem، وعند تمرير المصفوفة نفسها إلى buildCart ينتج cartTotalIqd = -750000. هذه الحالة غير قابلة للوصول من JSON.parse(localStorage) أو مدخلات DOM وتنحصر بالاستدعاء البرمجي المباشر بكائن غير عادي. ← قراءة record.productId وrecord.quantity مرة واحدة في متغيرين محليين قبل الفحص والجمع في src/lib/cart.ts#sanitizeCartItems، وذلك في بيئة TypeScript/Node.js الحالية. |
| SEC-01 | المدقق الأمني | Low | مؤكد | next.config.ts#nextConfig | لا تضيف تهيئة Next.js الحالية ترويسات الحماية الثابتة (X-Content-Type-Options وContent-Security-Policy وX-Frame-Options وReferrer-Policy) على مسار السلة الجديد /cart أو بقية استجابات HTML وملفات SVG، كما تُرسل ترويسة X-Powered-By: Next.js (موروثة من TASK-001 لأن next.config.ts لم يتغير في TASK-002). ومع خلو النطاق من الجلسات والرفع وخلو السلة من انعكاس المدخلات أو dangerouslySetInnerHTML، لا يوجد أثر استغلالي مباشر حالياً، لكنها طبقة تقوية مطلوبة قبل أي نشر عام. ← في مهمة تقوية لاحقة لتهيئة next.config.ts (وبمراعاة أن cacheComponents: true وpartialPrefetching: true لا يناسبهما CSP معتمد على nonce للصفحات الثابتة)، أضف دالة headers() ثابتة تتضمن X-Content-Type-Options: nosniff وReferrer-Policy: strict-origin-when-cross-origin وX-Frame-Options: DENY واضبط poweredByHeader: false. |
| SEC-02 | المدقق الأمني | Low | مؤكد | src/lib/cart.ts#formatCartTotalIqd | تتحقق دالة formatCartTotalIqd من شرط totalIqd < 0 وNumber.isSafeInteger(totalIqd)، وبما أن القيمة السالبة للصفر (-0) في JavaScript تحقق التساوي (-0 < 0 خطأ وisSafeInteger(-0) صحيح)، فإن Intl.NumberFormat ينتج النص "-0 د.ع". هذه الحالة غير قابلة للوصول عبر واجهة السلة أو buildCart لأن المجموع يبدأ من 0 ويجمع أعداداً موجبة فقط، وأثرها محصور في الاستدعاء البرمجي المباشر للدالة بقيمة -0. ← في src/lib/cart.ts#formatCartTotalIqd، ارفض القيمة عند Object.is(totalIqd, -0) برمي RangeError أو طبّعها عبر const normalized = Object.is(totalIqd, -0) ? 0 : totalIqd قبل التمرير إلى IQD_NUMBER_FORMATTER.format. |

| المحور الأمني | التغطية | السبب |
|---|---|---|
| access_control | TESTED_DYNAMIC | اختُبرت مسارات / و/products/1..10 و/cart (200) و/products/cart و/products/99 و/cart/checkout و/api/cart (404) وطلبات POST/PUT/DELETE/PATCH/OPTIONS على /cart (405) وطلبات POST مع ترويسة Next-Action (400) ديناميكياً على الخادم المحلي، مع فحص خلو الكود وserver-reference-manifest من أي API أو Server Actions أو نماذج دفع؛ لا توجد أدوار أو مستأجرون في هذا النطاق العام. |
| authentication | TESTED_DYNAMIC | تم التحقق ديناميكياً من غياب Set-Cookie عبر جميع الاستجابات وإرجاع 404 لمسارات /login و/signup و/account و/api/auth/session وتطابق استجابة /cart مع ترويسات Cookie/Authorization/X-User-Role المزورة، وبالمراجعة الساكنة واختبارات التخزين لغياب cookies() وتجريد حقول الجلسات المزروعة. |
| injection | TESTED_DYNAMIC | اختُبرت ديناميكياً استعلامات /cart?msg= بالترميز الخام والمشفّر وترويسة RSC وحمولات __proto__ دون أي انعكاس في HTML أو text/x-component، واختُبرت مفاتيح Object.prototype وإسقاط حمولات XSS من localStorage مع فحص غياب dangerouslySetInnerHTML وinnerHTML وeval في الكود وحزم العميل. |
| business_logic | TESTED_DYNAMIC | اختُبرت دوال النطاق والتخزين وصفحات المتجر الحية للتحقق من تجاهل الأسعار المزورة في localStorage واعتماد PRODUCTS حصراً، ودمج التكرار وتقييد الكمية ضمن 1..99، ورفض الكسور والسلاسل المخادعة دون تقريب، وصحة إجمالي السلة حتى 19,899,000 د.ع، مع رصد حالة حدية بسيطة لـ -0 في formatCartTotalIqd (SEC-02). |
| mass_assignment_data_exposure | TESTED_DYNAMIC | تم التحقق من حصر تسلسل localStorage في {productId, quantity}، وخلو .next/server/app/cart.rsc واستجابات HTTP 200/404/405/400 من الأسعار الداخلية أو تتبع الأخطاء أو المسارات المحلية أو البيانات الشخصية، والتعافي السلس من JSON معطوب أو version: 99 وأخطاء المتصفح. |
| resource_abuse_uploads | TESTED_DYNAMIC | اختُبرت دفعة 30 طلباً متزامناً على /cart و/products/cart (75 مللي ثانية، 15x 200 و15x 404)، ورفض حمولة localStorage بحجم 70000 محرف خلال 0 مللي ثانية، وتقييد المسح عند 200 عنصر؛ ولا توجد أي نقاط رفع ملفات في التطبيق. |
| configuration_secrets_supply_chain | TESTED_DYNAMIC | اختُبر التصيير الحتمي للسلة الفارغة أثناء SSR/RSC، وحقن ترويسات Host/X-Forwarded-Host/Origin على /cart و/cart/، وفحص الترويسات الأمنية الغائبة الموروثة من next.config.ts (SEC-01)، ومراجعة جميع حزم .next/static/chunks/*.js العشر وpackage.json ونتيجة npm audit (0 vulnerabilities في dependencies.log؛ بينما gitleaks وsemgrep غير مثبتتين). |

## 10. الاستهلاك
- الزمن منذ فتح المهمة: 17.5 ساعة
- مرات تشغيل verify: 1
- دورات الإصلاح: 0
- التكلفة (AI Credits): غير مسجّلة آلياً

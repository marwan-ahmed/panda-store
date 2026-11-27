# TRACE — TASK-001

> Every AC-n (SPEC) and every AB-n (THREAT_MODEL) maps to at least one test. The phase tool checks this.

| ID | Test file | Test name | Status | Notes |
|---|---|---|---|---|
| AC-1 | `tests/home.test.tsx` | `AC-1: تعرض الصفحة الرئيسية عنوان باندا ستور والكتالوج المكون من 10 منتجات دون عبارة قيد البناء مع جذر عربي RTL` | red | Fails because `Home` still renders placeholder `"المتجر قيد البناء."` and zero product cards |
| AC-2 | `tests/products-domain.test.ts` | `AC-2: يفرض الكتالوج وجود 10 منتجات بالضبط بمعرفات فريدة من 1 إلى 10` | red | Fails because `src/lib/products.ts` does not exist yet |
| AC-3 | `tests/products-domain.test.ts` | `AC-3: تحتوي المنتجات العشرة على حقول عربية غير فارغة وصور محلية دون بيانات شخصية حقيقية` | red | Fails because `src/lib/products.ts` and local SVG assets do not exist yet |
| AC-4 | `tests/products-domain.test.ts` | `AC-4: يقبل validatePriceIqd و formatPriceIqd الأعداد الصحيحة الموجبة وينسقانها بدقة بالدينار العراقي` | red | Fails because `src/lib/products.ts` does not exist yet |
| AC-5 | `tests/home.test.tsx` | `AC-5: تعرض كل بطاقة منتج الاسم والسعر الواحد الثابت والصورة المحلية والوصف ورابط التفاصيل دون خصومات أو رسوم` | red | Fails because `src/lib/products.ts` and `src/components/product-card.tsx` do not exist yet |
| AC-6 | `tests/product-routes.test.tsx` | `AC-6: يعرض مسار /products/3 تفاصيل المنتج الثالث كاملة مع رابط العودة إلى / ويمر من الوكيل بحالة 200` | red | Fails because `src/lib/products.ts`, `ProductDetails`, `/products/[id]`, and `src/proxy.ts` do not exist yet |
| AC-7 | `tests/product-routes.test.tsx` | `AC-7: يعيد الوكيل والمسارات حالة 404 مع رسالة المنتج غير موجود ورابط العودة دون كشف مسارات داخلية` | red | Fails because `src/lib/products.ts`, `NotFoundView`, 404 routes, and `src/proxy.ts` do not exist yet |
| AC-8 | `tests/home.test.tsx` | `AC-8: تخلو جميع واجهات المتجر من السلة وأزرار الشراء والدفع وتسجيل الدخول والبحث والتصفية` | red | Fails because `src/lib/products.ts`, `ProductDetails`, and `NotFoundView` do not exist yet |
| AC-9 | `tests/home.test.tsx` | `AC-9: جميع النصوص والبيانات الوصفية وبيانات المنتجات بالعربية RTL دون روابط صور خارجية` | red | Fails because `src/lib/products.ts` does not exist yet |
| EC-1 | `tests/products-domain.test.ts` | `EC-1: يرفض validateCatalog المصفوفات بعدد 0 أو 9 أو 11 أو بمعرفات مكررة` | red | negative edge-case test (`validateCatalog` missing) |
| EC-2 | `tests/products-domain.test.ts` | `EC-2: يرفض validatePriceIqd و formatPriceIqd القيم الصفرية والسالبة والعشرية وغير المنتهية وغير الآمنة` | red | negative edge-case test (`validatePriceIqd`/`formatPriceIqd` missing) |
| EC-3 | `tests/products-domain.test.ts` | `EC-3: يرفض validateProduct الحقول المفقودة أو الفارغة أو مسافات فقط ومسارات الصور غير المحلية` | red | negative edge-case test (`validateProduct` missing) |
| EC-4 | `tests/product-routes.test.tsx` | `EC-4: تعالج جميع المسارات المفقودة أو غير الصحيحة أو المشوهة بترميز URI بحالة 404 دون خطأ 500` | red | negative edge-case test (`src/proxy.ts` missing) |
| EC-5 | `tests/products-domain.test.ts` | `EC-5: يعيد getProductById القيمة undefined عند تمرير أسماء خصائص Object.prototype` | red | negative edge-case test (`getProductById`/`isValidProductId` missing) |
| AB-1 | `tests/product-routes.test.tsx` | `AB-1: يرفض التحكم بالوصول كل مسارات المنتجات المفقودة أو متعددة المقاطع أو الشبيهة باجتياز المسارات بحالة 404` | red | negative test (`access_control`: missing/traversal/multi-segment routes) |
| AB-2 | `tests/security-assets.test.ts` | `AB-2: يخلو التطبيق تماماً من Server Actions وواجهات API ومسارات أو أزرار السلة والدفع والإدارة` | red | negative test (`access_control`: no mutation APIs, actions, or commerce surfaces) |
| AB-3 | `tests/product-routes.test.tsx` | `AB-3: لا يصدر المتجر جلسات أو كوكيز ولا يقرأ cookies() في أي صفحة أو في الوكيل` | red | negative test (`authentication`: strictly unauthenticated, no `Set-Cookie` or `cookies()`) |
| AB-4 | `tests/products-domain.test.ts` | `AB-4: يرفض التحقق والتنسيق أي مدخلات مالية غير صحيحة أو سالبة أو عشرية دون تقريب أو تحويل قسري` | red | negative test (`business_logic`: invalid IQD monetary inputs) |
| AB-5 | `tests/products-domain.test.ts` | `AB-5: يرفض الكتالوج أي نقص أو زيادة عن 10 عناصر أو تكرار المعرفات أو فراغ الحقول المطلوبة` | red | negative test (`business_logic`: catalog count, duplicate IDs, blank fields) |
| AB-6 | `tests/products-domain.test.ts` | `AB-6: يحمي البحث بالمعرف من تسرب خصائص prototype عند تمرير __proto__ و constructor و toString` | red | negative test (`injection`: domain prototype-key protection) |
| AB-6 | `tests/product-routes.test.tsx` | `AB-6: يصد مسار المنتج وهيكله أسماء خصائص Object.prototype بحالة 404 دون تسرب أو خطأ 500` | red | negative test (`injection`: route & proxy prototype-key protection) |
| AB-7 | `tests/product-routes.test.tsx` | `AB-7: يمنع انعكاس حمولات XSS والترميز المشوه في مسارات المنتجات وعرض 404` | red | negative test (`injection`: reflected XSS & malformed percent-encoding) |
| AB-8 | `tests/security-assets.test.ts` | `AB-8: ترفض الدوال أي مسارات صور خارجية أو خبيثة وتخلو ملفات SVG العشرة المحلية من السكربتات والأحداث` | red | negative test (`injection`: unsafe `imageSrc` & static SVG sanitization) |
| AB-9 | `tests/products-domain.test.ts` | `AB-9: يسقط validateProduct الحقول الإضافية غير المصرح بها ولا يحوي الكتالوج بيانات شخصية حقيقية` | red | negative test (`mass_assignment_data_exposure`: DTO stripping & zero PII) |
| AB-10 | `tests/product-routes.test.tsx` | `AB-10: يعالج الوكيل المسارات العميقة والمعرفات الطويلة وحقن الاستعلامات ودفعات الطلبات دون ReDoS أو تمرير query string` | red | negative test (`resource_abuse_uploads`: deep paths, long IDs, query stripping, burst) |
| AB-11 | `tests/security-assets.test.ts` | `AB-11: يحافظ التكوين والوكيل والتخطيط والاعتماديات على الإعدادات الآمنة دون أسرار أو إعادة توجيه خارجية` | red | negative test (`configuration_secrets_supply_chain`: config, proxy headers, deps, secrets) |

# TRACE — TASK-002

> Every AC-n (SPEC) and every AB-n (THREAT_MODEL) maps to at least one test. The phase tool checks this.

| ID | Test file | Test name | Status | Notes |
|---|---|---|---|---|
| AC-1 | `tests/cart-ui.test.tsx` | `AC-1: يعرض التخطيط العام رأس المتجر مع رابط السلة والعداد 0 وأزرار أضف إلى السلة في الرئيسية والتفاصيل` | red | |
| AC-2 | `tests/cart-domain.test.ts` | `AC-2: تضيف addToCart المنتج الأول إلى سلة فارغة وتدمج الإضافة الثانية في سطر واحد بحساب صحيح` | red | |
| AC-2 | `tests/cart-ui.test.tsx` | `AC-2: يحدث النقر على أضف إلى السلة العداد والتخزين المحلي بشكل متطابق عبر البطاقة والتفاصيل` | red | |
| AC-3 | `tests/cart-domain.test.ts` | `AC-3: تقبل updateCartQuantity الحد الأقصى 99 وترفض الزيادة إلى 100 والمدخلات غير الصالحة دون إتلاف الكمية` | red | |
| AC-3 | `tests/cart-ui.test.tsx` | `AC-3: تدعم واجهة السلة الكمية 99 وتمنع تجاوزها مع تنبيه عربي وترفض المدخلات غير الصالحة` | red | |
| AC-4 | `tests/cart-domain.test.ts` | `AC-4: تحافظ decrementCartItem على الحد الأدنى 1 وتحذف removeFromCart بنداً واحداً وتفرغ clearCart السلة` | red | |
| AC-4 | `tests/cart-ui.test.tsx` | `AC-4: تعطل واجهة السلة الإنقاص عند 1 وتحذف البند المفرد وتفرغ السلة بالكامل` | red | |
| AC-5 | `tests/cart-domain.test.ts` | `AC-5: تحسب buildCart مجاميع الأسطر والإجمالي بدقة عددية صحيحة حتى الحد الأقصى 19,899,000 د.ع` | red | |
| AC-6 | `tests/cart-ui.test.tsx` | `AC-6: يعرض المسار /cart حالة الفراغ وحالة الامتلاء الكاملة باللغة العربية ورابط العودة للكتالوج` | red | |
| AC-7 | `tests/cart-storage.test.ts` | `AC-7: يحفظ المخزن المحلي صيغة panda-store:cart:v1 المسموح بها فقط ويستعيدها عبر التنقل وحدث storage` | red | |
| AC-7 | `tests/cart-ui.test.tsx` | `AC-7: تتزامن واجهة الرأس والسلة بعد إعادة التركيب وعند استقبال حدث storage بين التبويبات` | red | |
| AC-8 | `tests/cart-storage.test.ts` | `AC-8: ينظف parseStoredCart البيانات الفاسدة والمختلطة ويدمج المعرفات المكررة حتى 99` | red | |
| AC-9 | `tests/cart-ui.test.tsx` | `AC-9: تخلو جميع المسارات والمكونات من نماذج الطلب والدفع والخصومات والمصادقة وتبقى مسارات الكتالوج و 404 سليمة` | red | TASK-001 `tests/home.test.tsx#AC-8` and `tests/security-assets.test.ts#AB-2` updated to permit client cart controls while preserving checkout/payment/auth/search bans |
| AC-10 | `tests/cart-ui.test.tsx` | `AC-10: تحافظ الواجهة على العربية RTL والاعتماديات المعتمدة دون طلبات خارجية أو أسرار أو بيانات شخصية حقيقية` | red | |
| EC-1 | `tests/cart-domain.test.ts` | `EC-1: ترفض عمليات السلة المعرفات الفارغة وغير المدرجة ومفاتيح Object.prototype` | red | |
| EC-2 | `tests/cart-domain.test.ts` | `EC-2: تقبل validateCartQuantity و parseQuantityInput الحدين 1 و 99 وترفض الكسور والسلاسل المخادعة دون تقريب` | red | |
| EC-3 | `tests/cart-domain.test.ts` | `EC-3: تحافظ decrementCartItem على السطر عند الكمية 1 وينقل حذف آخر عنصر إلى 0 د.ع` | red | |
| EC-4 | `tests/cart-domain.test.ts` | `EC-4: تقبل formatCartTotalIqd القيم الصحيحة غير السالبة وترفض السالب والكسور بينما يرفض formatPriceIqd الصفر` | red | |
| EC-5 | `tests/cart-storage.test.ts` | `EC-5: يتعافى التخزين بأمان من النصوص الضخمة والإصدارات المجهولة وأخطاء المتصفح` | red | |
| EC-6 | `tests/cart-storage.test.ts` | `EC-6: يعيد getServerCartSnapshot سلة فارغة دائماً ويثبت مرجع getCartSnapshot عند عدم التغير` | red | |
| AB-1 | `tests/cart-ui.test.tsx` | `AB-1: يفرض التحكم بالوصول غياب نقاط API و Server Actions ونماذج الدفع واستمرار 404 على /products/cart` | red | negative test |
| AB-2 | `tests/cart-storage.test.ts` | `AB-2: يجرد parseStoredCart و repairStoredCartIfNeeded حقول المصادقة والجلسات المزروعة في localStorage` | red | negative test |
| AB-2 | `tests/cart-ui.test.tsx` | `AB-2: تخلو ملفات السلة من cookies() و Set-Cookie ونماذج تسجيل الدخول وتجرد حقول الجلسات` | red | negative test |
| AB-3 | `tests/cart-domain.test.ts` | `AB-3: تسقط sanitizeCartItems و buildCart الأسعار والبيانات المزورة وتعتمد أسعار PRODUCTS حصراً` | red | negative test |
| AB-3 | `tests/cart-storage.test.ts` | `AB-3: يزيل التخزين الأسعار والأسماء والصور المزورة ويصلح localStorage عبر CartProvider` | red | negative test |
| AB-4 | `tests/cart-domain.test.ts` | `AB-4: تدمج sanitizeCartItems السطور المكررة للمنتج نفسه وتقيد المجموع عند الحد الأقصى 99` | red | negative test |
| AB-4 | `tests/cart-storage.test.ts` | `AB-4: يدمج parseStoredCart التكرار المتجاوز للحد ويقيده عند 99 مع تفعيل needsRepair` | red | negative test |
| AB-5 | `tests/cart-domain.test.ts` | `AB-5: تصد دوال الكمية محاولات تجاوز الحدود أو التحويل القسري وتحافظ على الكمية السابقة` | red | negative test |
| AB-6 | `tests/cart-domain.test.ts` | `AB-6: تحمي حسابات المجاميع من الأعداد غير الآمنة والتنسيق غير الصحيح دون إضعاف formatPriceIqd` | red | negative test |
| AB-7 | `tests/cart-domain.test.ts` | `AB-7: تمنع دوال السلة تلوث prototype والخصائص الموروثة عند تمرير كائنات ومفاتيح خبيثة` | red | negative test |
| AB-7 | `tests/cart-storage.test.ts` | `AB-7: يصد parseStoredCart مفاتيح __proto__ المضمنة في JSON دون تلويث Object.prototype` | red | negative test |
| AB-8 | `tests/cart-storage.test.ts` | `AB-8: يسقط parseStoredCart حمولات XSS في المعرفات والحقول الإضافية` | red | negative test |
| AB-8 | `tests/cart-ui.test.tsx` | `AB-8: تمنع واجهة السلة حقن XSS من localStorage أو إدخال الكمية ولا تحتوي dangerouslySetInnerHTML` | red | negative test |
| AB-9 | `tests/cart-domain.test.ts` | `AB-9: تخرج sanitizeCartItems كائنات مجمدة تحتوي على productId و quantity فقط دون حقول غير مصرح بها` | red | negative test |
| AB-9 | `tests/cart-storage.test.ts` | `AB-9: تكتب serializeCart حقولاً مسموحاً بها فقط وتمنع تخزين الأسماء والأسعار والبيانات الشخصية` | red | negative test |
| AB-10 | `tests/cart-storage.test.ts` | `AB-10: يتعامل التخزين والمخزن مع JSON المعطوب و SecurityError و QuotaExceededError دون انهيار` | red | negative test |
| AB-11 | `tests/cart-storage.test.ts` | `AB-11: يحد parseStoredCart حجم النص وعدد العناصر عند 200 ولا يتجمد عند الحمولات الكبيرة وطفرات التعديل` | red | negative test |
| AB-12 | `tests/cart-ui.test.tsx` | `AB-12: يتوافق المخزن والمكونات مع Activity وتصيير الخادم الحتمي والاختبار المنفرد وإعدادات Next.js الآمنة` | red | negative test |
| AB-13 | `tests/cart-ui.test.tsx` | `AB-13: يتحقق فحص الاعتماديات والأسرار والروابط من بقاء الحزمة نظيفة وعربية RTL` | red | negative test |

import Link from "next/link";

/**
 * Static Arabic RTL 404 view that never reflects untrusted path parameters.
 */
export function NotFoundView() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <section className="w-full rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="mb-3 text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-neutral-100">
          المنتج غير موجود
        </h1>
        <p className="mb-6 text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
          عذراً، المنتج المطلوب غير مدرج في كتالوج باندا ستور.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          العودة إلى الكتالوج
        </Link>
      </section>
    </main>
  );
}

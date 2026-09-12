export const dynamic = "force-dynamic";

export default function HomePagePlaceholder() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center px-6 py-20">
      <section className="w-full rounded-2xl border border-stone-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-stone-900">ArkAgentic Platform - Under Redesign</h1>
        <p className="mt-3 text-sm text-stone-600">
          The main site is being rebuilt. Please use gateway.arkagentic.com for existing gateway features.
        </p>
      </section>
    </main>
  );
}

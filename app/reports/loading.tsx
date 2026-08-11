import { SiteFooter, SiteNav } from "../_components/chrome";

export default function ReportsLoading() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <p className="font-mono text-caption text-muted">REPORTS</p>
        <h1 className="mt-6 max-w-[880px] font-serif text-[48px] leading-[0.98] md:text-[64px]">
          Loading reports.
        </h1>
        <div
          className="mt-12 border-y border-border py-14 font-serif text-p2 text-muted"
          role="status"
        >
          Checking access and reading the stored snapshots...
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

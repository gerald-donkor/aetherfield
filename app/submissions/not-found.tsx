import { SiteFooter, SiteNav } from "../_components/chrome";
import { ButtonLink } from "../_components/primitives";

export default function SubmissionsNotFound() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <p className="font-mono text-caption text-muted">OPERATIONS</p>
        <h1 className="mt-6 max-w-[760px] font-serif text-[48px] leading-[0.98] md:text-[64px]">
          {"That application isn't available."}
        </h1>
        <p className="mt-7 max-w-[640px] font-serif text-p2 text-muted">
          It may have been removed, or the link may be incomplete.
        </p>
        <ButtonLink href="/submissions?view=applications" className="mt-10">
          Return to applications
        </ButtonLink>
      </main>
      <SiteFooter />
    </>
  );
}

import Image from "next/image";

/* Monthly carbon emissions, Jan–Jun. Shape traced from the comp: a slow climb
   to a 220 peak in late April, then a sustained decline. */
const BARS = [
  35, 38, 40, 42, 45, 48, 52, 58, 63, 70, 78, 86, 95, 104, 118, 132, 155, 175,
  195, 212, 220, 214, 198, 178, 165, 158, 150, 140, 132, 126, 120, 116, 112,
];
const PEAK = BARS.indexOf(220);
const Y_TICKS = [240, 160, 80, 0];
const MONTHS = ["Feb", "Mar", "Apr", "May", "Jun"];

function Asterisk() {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      className="size-[2.4em]"
      aria-hidden
    >
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
    </svg>
  );
}

/**
 * Product mockup for the hero.
 *
 * Every internal dimension is expressed in `em` against a root of `1cqw`, so
 * the whole panel scales proportionally with its container — which is how the
 * comps behave: the mobile view is a miniature of the desktop layout rather
 * than a reflow.
 */
export function HeroDashboard() {
  return (
    <div className="@container w-full">
      <div className="rounded-[2.5em] border-2 border-ink bg-surface p-[2.3em] text-[1cqw] text-ink">
        <p className="font-sans text-[2.1em] leading-tight font-bold">
          Good morning, Acme Inc
        </p>
        <p className="font-serif text-[2.05em] leading-tight text-muted">
          Your daily impact metrics are ready to review.
        </p>

        {/* Stat tiles */}
        <div className="mt-[1.9em] grid grid-cols-3 gap-[1.9em]">
          {/* Emissions */}
          <div className="flex h-[13em] justify-between gap-[1em] border border-border bg-white p-[1.2em]">
            <div className="flex flex-col justify-between">
              <span className="font-mono text-[1.25em] whitespace-nowrap">
                192,000 tCO<sub>2</sub>e
              </span>
              <p className="font-sans text-[3em] leading-none font-bold">
                56<span className="align-super text-[0.55em]">%</span>
              </p>
            </div>
            <span className="w-[15.1em] shrink-0 self-stretch bg-brand" />
          </div>

          {/* Energy */}
          <div className="flex h-[13em] flex-col justify-between border border-border bg-white p-[1.2em]">
            <div className="flex items-start justify-between">
              <span className="font-mono text-[1.25em]">
                Energy consumption
              </span>
              <Asterisk />
            </div>
            <div className="flex items-baseline justify-between">
              <p className="font-sans text-[3em] leading-none font-bold">
                583.7<span className="ml-[0.3em] text-[0.42em]">MWh</span>
              </p>
              <span className="font-mono text-[1.25em] text-accent">↓12.4%</span>
            </div>
          </div>

          {/* Forecast */}
          <div className="flex h-[13em] items-stretch gap-[1.4em] border border-border bg-white p-[1.2em]">
            <div className="relative w-[10.4em] shrink-0 self-stretch overflow-hidden">
              <Image
                src="/assets/images/Image-7.png"
                alt=""
                fill
                sizes="140px"
                className="object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-col justify-between">
              <span className="self-start bg-brand px-[0.7em] py-[0.25em] font-mono text-[1.15em] text-brand-ink">
                Forecast
              </span>
              <p className="font-sans text-[1.5em] leading-snug font-bold">
                You&rsquo;re 16% off your 2027 emissions goal
              </p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-[1.9em] border border-border bg-white p-[1.5em]">
          <p className="font-mono text-[1.25em]">Carbon emissions trend</p>
          <div className="mt-[1.4em] flex gap-[1em]">
            {/* y axis */}
            <div className="flex w-[2.6em] shrink-0 flex-col justify-between py-[0.6em] text-right font-mono text-[1.1em] text-muted">
              {Y_TICKS.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            {/* plot */}
            <div className="min-w-0 flex-1">
              <div className="relative flex h-[21em] items-end justify-between gap-[0.45em]">
                {Y_TICKS.map((t) => (
                  <span
                    key={t}
                    style={{ bottom: `${(t / 240) * 100}%` }}
                    className="absolute inset-x-0 border-t border-border"
                    aria-hidden
                  />
                ))}
                {BARS.map((v, i) => (
                  <span key={i} className="relative flex-1">
                    {i === PEAK ? (
                      <span className="absolute bottom-full left-1/2 mb-[0.6em] -translate-x-1/2 rounded-full bg-brand px-[0.7em] py-[0.15em] font-mono text-[1.1em] text-brand-ink">
                        220
                      </span>
                    ) : null}
                    <span
                      style={{ height: `${(v / 240) * 21}em` }}
                      className="block w-[0.3em] bg-ink"
                    />
                  </span>
                ))}
              </div>
              <div className="mt-[0.8em] flex justify-around font-mono text-[1.1em] text-muted">
                {MONTHS.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

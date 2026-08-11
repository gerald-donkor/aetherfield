import Link from "next/link";

const ITEMS = [
  { key: "dashboard", label: "Overview", href: "/dashboard" },
  { key: "activity", label: "Activity", href: "/activity" },
  { key: "targets", label: "Targets", href: "/targets" },
  { key: "reports", label: "Reports", href: "/reports" },
] as const;

export function WorkspaceNav({
  current,
}: {
  current: (typeof ITEMS)[number]["key"];
}) {
  return (
    <nav aria-label="Product workspace" className="mb-12">
      <ul className="flex flex-wrap gap-x-6 gap-y-3 border-b border-border pb-4">
        {ITEMS.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={current === item.key ? "page" : undefined}
              className="inline-block py-1 font-sans text-nav font-bold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:underline"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

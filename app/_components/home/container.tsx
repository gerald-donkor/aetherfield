/* Shared page container: 1232px content inside 24px gutters. */
export function Container({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // Gutters measured from the comps: 20px up to tablet, 24px on desktop.
    <div className={`mx-auto w-full max-w-page px-5 lg:px-6 ${className}`}>
      {children}
    </div>
  );
}

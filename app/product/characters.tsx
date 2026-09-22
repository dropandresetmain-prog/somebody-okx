// Approved character slots for the V6 surface. Paths only — no generated art,
// no pose invention. Intern uses the approved Direction-1 still until dedicated
// production poses exist. Duo transparent variants are for in-product use;
// background variants stay archival.

export const INTERN_NEUTRAL_SRC = "/mascot/intern/intern-neutral.webp";

export const DUO_SRC = {
  working: "/mascot/duo/duo-working-transparent.webp",
  walking: "/mascot/duo/duo-walking-transparent.webp",
  coffee: "/mascot/duo/duo-coffee-transparent.webp",
} as const;

export function InternArt({
  className,
  alt = "Intern, bright-eyed generalist",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={INTERN_NEUTRAL_SRC} alt={alt} />
  );
}

export function InternFrame({ alt }: { alt?: string }) {
  return (
    <div className="v6-intern-frame">
      <InternArt className="v6-intern-source" alt={alt} />
    </div>
  );
}

export function DuoArt({
  pose,
  className,
  alt,
}: {
  pose: keyof typeof DUO_SRC;
  className?: string;
  alt: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={DUO_SRC[pose]} alt={alt} />
  );
}

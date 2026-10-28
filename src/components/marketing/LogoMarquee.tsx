"use client";

/**
 * Logo Marquee — Encord Style.
 *
 * Infinite scrolling customer logo strip using hardware-accelerated CSS animation.
 * Logos are displayed in grayscale with uniform height for a clean, monochrome strip.
 * Positioned with balanced breathing room under hero container.
 * Logos are duplicated for seamless infinite loop.
 */
export function LogoMarquee() {
  const logos = [
    { name: "Standard AI" },
    { name: "Archetype" },
    { name: "Agility" },
    { name: "Forterra" },
    { name: "Hitachi" },
    { name: "UiPath" },
    { name: "Neura" },
  ];

  // Duplicate logos for seamless marquee loop
  const duplicatedLogos = [...logos, ...logos];

  return (
    <section className="bg-white py-2 lg:py-3" style={{ marginTop: '3.25rem !important', paddingTop: '0px !important' }} aria-label="Customer logos">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-10">
        <div className="overflow-hidden">
          <div className="flex items-center gap-8 lg:gap-12 whitespace-nowrap animate-marquee">
            {duplicatedLogos.map((logo, index) => (
              <div
                key={`${logo.name}-${index}`}
                className="flex-shrink-0 flex items-center logo-marquee-item"
              >
                <span className="font-display text-[1.125rem] lg:text-[1.25rem] font-medium tracking-[-0.01em] text-[#000000] leading-tight whitespace-nowrap px-4">
                  {logo.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
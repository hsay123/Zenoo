"use client";

/**
 * Feature Bento Box — Encord Style.
 *
 * Full-width bento card with embedded video on left, text and CTA on right.
 * Responsive: 2-column grid on desktop, stacked on mobile.
 * Pushed below the fold with top margin.
 */
export function FeatureBento() {
  return (
    <section className="bg-white py-16 lg:py-24" style={{ marginTop: '9.25rem !important' }}>
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-10">
        {/* Section Header — single-line heading on desktop */}
        <div className="mx-auto w-full max-w-none text-center mb-16 lg:mb-20">
          <h2 className="font-display font-bold text-[#000000] tracking-[-0.02em] leading-[1.1] lg:whitespace-nowrap"
              style={{ 
                fontSize: 'clamp(2.2rem, 3.5vw, 3.2rem)',
                maxWidth: 'max-content',
                margin: '0 auto'
              }}>
            Manage, curate, and annotate AI data
          </h2>
          <p className="mt-4 text-body-lg text-[#555555] leading-relaxed max-w-2xl mx-auto">
            With customizable multimodal workflows and native agent integrations.
          </p>
        </div>

        {/* Bento Box Card */}
        <div className="bento-card flex flex-col lg:flex-row gap-10 lg:gap-12 items-center p-8 lg:p-12">
          {/* Left Column: Video */}
          <div className="w-full lg:w-[60%] flex-shrink-0">
            <div className="relative aspect-video rounded-xl overflow-hidden">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                aria-label="Annotation and labeling workflow demo"
              >
                <source src="/Organ.mp4" type="video/mp4" />
              </video>
            </div>
          </div>

          {/* Right Column: Text & CTA */}
          <div className="w-full lg:w-[40%] flex flex-col justify-center">
            <h3 className="font-display text-3xl lg:text-4xl font-bold text-[#000000] tracking-[-0.02em] leading-[1.1] mb-6">
              Label and annotate
            </h3>
            <p className="text-[#4A4A4A] text-body-lg leading-relaxed mb-8">
              Native video annotation, LiDAR, audio, text, and sensor fusion in the same workflow. Label lineage and quality controls built in for production scale.
            </p>
            <a
              href="/explore"
              className="inline-flex items-center justify-center gap-2 w-fit px-6 py-3 bg-white text-[#000000] border border-[#E0E0E0] rounded-md font-semibold text-body transition-all duration-200 hover:border-[#CCCCCC] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
            >
              Explore annotation & labeling
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
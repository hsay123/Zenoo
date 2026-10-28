"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { capabilityIntro } from "@/lib/content/landing";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/SectionHeading";
import { BentoCard } from "@/components/ui/BentoCard";

/**
 * Capability Introduction — Zeno Premium Motion Design.
 *
 * Large full-width feature card with animated WebM background,
 * scroll-revealed workflow stages, and subtle data-flow motion.
 * Followed by a 2-column grid of feature cards.
 */
export function CapabilityIntro() {
  const [isInView, setIsInView] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const workflowStages = [
    { label: "Collect", description: "Rights-cleared multimodal data ingested privately" },
    { label: "Annotate", description: "Contributors label regions, actions, and sensor streams" },
    { label: "Review", description: "Independent rubric validation with reason-coded decisions" },
    { label: "Deliver", description: "Frozen accepted versions exported with full provenance" },
  ];

  return (
    <Section tone="canvas" spacing="loose" contained={false}>
      <Container size="wide">
        {/* Section Header */}
        <div className="text-center mb-16 lg:mb-24 mx-auto">
          <Eyebrow>{capabilityIntro.eyebrow}</Eyebrow>
          <h2 className="mt-6 text-display-lg text-[#000000] font-bold tracking-[-0.04em] leading-[1.0] max-w-[1000px] mx-auto hyphens-none word-break-keep-all"
              dangerouslySetInnerHTML={{ __html: capabilityIntro.heading }} />
          <p className="mt-6 text-body-lg text-[#333333] max-w-2xl mx-auto leading-relaxed">
            {capabilityIntro.support}
          </p>
        </div>

        {/* Bento Grid — Full width featured card + 2 column grid */}
        <div className="grid gap-6 lg:gap-8 lg:grid-cols-2">
          {/* Large Featured Card - Full Width with Animated Background */}
          <div
            ref={sectionRef}
            className="bento-card lg:col-span-2 relative overflow-hidden bg-[#F8F9FA] border border-[#E5E7EB] p-8 lg:p-12 lg:px-16"
            style={{ borderRadius: '24px' }}
          >
            {/* Subtle Technical Grid Overlay */}
            <div
              className="absolute inset-0 pointer-events-none z-[0]"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px)
                `,
                backgroundSize: '48px 48px',
                opacity: prefersReducedMotion ? 0 : 1,
              }}
              aria-hidden="true"
            />

            {/* Lime Accent Line - Top */}
            <div
              className="absolute left-0 right-0 top-0 h-px pointer-events-none z-[1]"
              style={{
                background: 'linear-gradient(90deg, transparent, #CCFF00 50%, transparent)',
                opacity: prefersReducedMotion ? 0 : 0.6,
              }}
              aria-hidden="true"
            />

            {/* Background Video Asset — WebM Animation */}
            {!videoError && (
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="workflow-bg-video"
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'right center',
                  pointerEvents: 'none',
                  zIndex: 1,
                  opacity: prefersReducedMotion ? 0 : 0.75,
                  borderRadius: '24px',
                  transition: 'opacity 0.6s ease-out',
                }}
                aria-hidden="true"
                onError={() => setVideoError(true)}
                poster="/workflow-poster.webp"
              >
                <source src="https://encord.cdn.prismic.io/encord/ah7U1geQX7-eWjLz_Data-layer-graphic_17.webm" type="video/webm" />
              </video>
            )}

            {/* Subtle Gradient Overlay for Text Contrast — Full width */}
            <div
              className="absolute inset-0 pointer-events-none z-[2]"
              style={{
                background: 'linear-gradient(270deg, rgba(248,249,250,0.98) 0%, rgba(248,249,250,0.8) 35%, rgba(248,249,250,0.3) 55%, transparent 100%)',
                borderRadius: '24px',
              }}
              aria-hidden="true"
            />

            {/* Data Flow Particles - CSS Animation */}
            {!prefersReducedMotion && (
              <div className="absolute inset-0 pointer-events-none z-[3] overflow-hidden" aria-hidden="true">
                <style jsx>{`
                  @keyframes dataFlow {
                    0% { transform: translateX(-120%) translateY(0); opacity: 0; }
                    10% { opacity: 0.4; }
                    80% { opacity: 0.4; }
                    100% { transform: translateX(120%) translateY(-20px); opacity: 0; }
                  }
                  .flow-particle {
                    position: absolute;
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: #CCFF00;
                    box-shadow: 0 0 8px #CCFF00, 0 0 16px rgba(204,255,0,0.3);
                    animation: dataFlow 12s linear infinite;
                  }
                `}</style>
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="flow-particle"
                    style={{
                      top: `${15 + i * 10}%`,
                      left: '-20px',
                      animationDelay: `${i * 1.5}s`,
                      animationDuration: `${10 + i * 2}s`,
                      opacity: 0,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Foreground Content Container */}
            <div className="relative z-10 max-w-[680px]">
              {/* Tag Line */}
              <div style={{ opacity: isInView ? 1 : 0, transform: isInView ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s ease-out 0.1s' }}>
                <Eyebrow className="text-[#CCFF00] text-eyebrow tracking-[0.08em] mb-2">
                  <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[#CCFF00] mr-2" />
                  THE WORKFLOW
                </Eyebrow>
              </div>

              {/* Heading (Two-Line Alignment) */}
              <h3 className="mt-4 font-display font-bold text-[#0F172A] tracking-[-0.02em] leading-[1.15] hyphens-none word-break-keep-all max-w-[620px]"
                  style={{
                    fontSize: 'clamp(2.2rem, 3.5vw, 3.2rem)',
                    opacity: isInView ? 1 : 0,
                    transform: isInView ? 'translateY(0)' : 'translateY(16px)',
                    transition: 'all 0.7s ease-out 0.2s',
                  }}
                  dangerouslySetInnerHTML={{ __html: capabilityIntro.heading }} />

              {/* Body Text */}
              <p className="mt-6 text-body-lg text-[#475569] leading-relaxed max-w-[580px]"
                 style={{
                   opacity: isInView ? 1 : 0,
                   transform: isInView ? 'translateY(0)' : 'translateY(16px)',
                   transition: 'all 0.7s ease-out 0.35s',
                 }}>
                {capabilityIntro.support}
              </p>

              {/* Workflow Stage Indicators - Progressive Reveal */}
              <div className="mt-10 flex flex-wrap items-center gap-4 lg:gap-6"
                   style={{
                     opacity: isInView ? 1 : 0,
                     transform: isInView ? 'translateY(0)' : 'translateY(20px)',
                     transition: 'all 0.8s ease-out 0.5s',
                   }}>
                {workflowStages.map((stage, index) => (
                  <div
                    key={stage.label}
                    className="flex items-center gap-2 px-3 py-2 bg-white/80 backdrop-blur-sm border border-[#E5E7EB] rounded-lg text-sm font-medium text-[#0F172A]"
                    style={{
                      transition: 'all 0.4s ease-out',
                      animationDelay: `${0.1 + index * 0.08}s`,
                    }}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center text-xs font-bold text-white rounded-full"
                      style={{ background: '#CCFF00', color: '#000000' }}
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="hidden sm:inline">{stage.label}</span>
                  </div>
                ))}
              </div>

              {/* Traceability Detail - Illustrative */}
              <div className="mt-8 flex items-center gap-3 px-4 py-3 bg-white/60 backdrop-blur-sm border border-[#E5E7EB] rounded-lg max-w-[580px]"
                   style={{
                     opacity: isInView ? 0.9 : 0,
                     transform: isInView ? 'translateY(0)' : 'translateY(16px)',
                     transition: 'all 0.7s ease-out 0.65s',
                   }}>
                <svg className="h-5 w-5 text-[#CCFF00] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div className="text-sm text-[#475569]">
                  <span className="font-semibold text-[#0F172A]">Traceable by design:</span> schema version · review decision · recorded receipt
                </div>
              </div>
            </div>

            {/* Workflow Media — D1.png */}
            <div
              className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[50%] max-w-[600px] h-[70%] min-h-[400px] pointer-events-none"
              aria-label="Workflow media"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <Image
                  src="/images/d1.png"
                  alt="Zeno workflow visualization"
                  fill
                  className="object-contain"
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </div>
          </div>

          {/* Feature Card 1 — Annotate & Structure */}
          <div className="bento-card flex flex-col group"
               style={{
                 opacity: isInView ? 1 : 0,
                 transform: isInView ? 'translateY(0)' : 'translateY(20px)',
                 transition: 'all 0.6s ease-out 0.2s',
               }}>
            <div className="flex-1">
              <h3 className="text-2xl lg:text-3xl font-bold text-[#000000] tracking-[-0.02em] mb-4">
                Annotate & Structure
              </h3>
              <p className="text-[#333333] leading-relaxed mb-6">
                Turn images and video into structured labels. Contributors work inside a focused browser workspace drawing regions on still images or placing action boundaries against timecode.
              </p>
              <ul className="space-y-3 text-[#333333]">
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Image region and video action annotation</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Object boxes or action labels with timestamps</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Task-specific schema per project</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Contributor instructions in context</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Versioned submissions — corrections never overwrite history</span>
                </li>
              </ul>
            </div>
            <a href="#" className="mt-6 text-sm font-medium text-[#CCFF00] hover:text-[#B8E600] inline-flex items-center gap-1.5 group-hover:gap-2 transition-all">
              Learn more
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4" />
              </svg>
            </a>
          </div>

          {/* Feature Card 2 — Review & Validate */}
          <div className="bento-card flex flex-col group"
               style={{
                 opacity: isInView ? 1 : 0,
                 transform: isInView ? 'translateY(0)' : 'translateY(20px)',
                 transition: 'all 0.6s ease-out 0.3s',
               }}>
            <div className="flex-1">
              <h3 className="text-2xl lg:text-3xl font-bold text-[#000000] tracking-[-0.02em] mb-4">
                Review & Validate
              </h3>
              <p className="text-[#333333] leading-relaxed mb-6">
                Independent review against a rubric you define. Server-side validator checks schema first, then a reviewer compares the submission against source media and records a reason-coded decision.
              </p>
              <ul className="space-y-3 text-[#333333]">
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Rubric-based evaluation with published reason codes</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Accept, request correction, or reject with stated reason</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Full review history: reviewer, decision, notes, rubric version</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Quality reports with acceptance and correction counts</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Accepted-version tracking for reproducible delivery</span>
                </li>
              </ul>
            </div>
            <a href="#" className="mt-6 text-sm font-medium text-[#CCFF00] hover:text-[#B8E600] inline-flex items-center gap-1.5 group-hover:gap-2 transition-all">
              Learn more
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4" />
              </svg>
            </a>
          </div>

          {/* Feature Card 3 — Deliver & Verify */}
          <div className="bento-card flex flex-col group"
               style={{
                 opacity: isInView ? 1 : 0,
                 transform: isInView ? 'translateY(0)' : 'translateY(20px)',
                 transition: 'all 0.6s ease-out 0.4s',
               }}>
            <div className="flex-1">
              <h3 className="text-2xl lg:text-3xl font-bold text-[#000000] tracking-[-0.02em] mb-4">
                Deliver & Verify
              </h3>
              <p className="text-[#333333] leading-relaxed mb-6">
                Accepted work becomes a dataset you can trace. Export frozen sets of accepted versions with schema, quality report, and provenance manifest mapping back to decisions.
              </p>
              <ul className="space-y-3 text-[#333333]">
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>JSONL and CSV exports of accepted records only</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Schema and version information shipped with the data</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Quality report with stated definitions and sample sizes</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Provenance manifest: source references, checksums, export version</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  <span>Settlement status shown where payment records exist</span>
                </li>
              </ul>
            </div>
            <a href="#" className="mt-6 text-sm font-medium text-[#CCFF00] hover:text-[#B8E600] inline-flex items-center gap-1.5 group-hover:gap-2 transition-all">
              Learn more
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4" />
              </svg>
            </a>
          </div>
        </div>
      </Container>
    </Section>
  );
}
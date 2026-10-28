/**
 * Centralised media registry.
 *
 * Every image and video the site renders is declared here so that final
 * assets can be dropped into `/public` and wired up in one place.
 *
 * Until an asset exists, `src` stays `null` and the shared media
 * placeholder components render an intentional, on-brand stand-in that
 * names the file that is expected. Nothing renders a broken image URL.
 *
 * To ship a real asset:
 *   1. Put the file at the documented `expectedPath` under `/public`.
 *   2. Set `src` to that public path.
 *   The consuming component automatically switches from placeholder to
 *   real media — no layout or markup changes required.
 */

export type MediaAsset = {
  /** Public path once the asset ships, e.g. `/media/hero-robotics.mp4`. */
  src: string | null;
  /** Public path the asset is expected to live at. */
  expectedPath: string;
  /** Aspect ratio as `width / height`, used to reserve space. */
  aspect: number;
  /** Exactly what should replace the placeholder. */
  description: string;
  /** Accessible label used once a real asset is present. */
  alt: string;
  /** Optional poster for video assets. */
  poster?: string | null;
  /** Poster path the asset is expected to live at. */
  posterExpectedPath?: string;
};

const image = (
  key: string,
  aspect: number,
  description: string,
  alt: string,
): MediaAsset => ({
  src: null,
  expectedPath: `/images/${key}`,
  aspect,
  description,
  alt,
});

const video = (
  key: string,
  posterKey: string,
  aspect: number,
  description: string,
  alt: string,
): MediaAsset => ({
  src: null,
  expectedPath: `/media/${key}`,
  poster: null,
  posterExpectedPath: `/media/${posterKey}`,
  aspect,
  description,
  alt,
});

export const media = {
  /* ---- Landing: hero ------------------------------------------------ */
  heroVideo: video(
    "hero-robotics.mp4",
    "hero-poster.webp",
    16 / 9,
    "Hero loop — a robot arm performing a manipulation task, shot as a single wide clip.",
    "Robotic manipulator performing a pick-and-place task on an assembly surface.",
  ),

  /* ---- Landing: capability introduction ----------------------------- */
  capabilityOverview: image(
    "capability-overview.webp",
    16 / 10,
    "Composed still of the annotation workspace with a clip loaded, timeline populated and the label schema visible.",
    "The Zeno annotation workspace with a video clip loaded and a populated timeline.",
  ),

  /* ---- Landing: capability sections --------------------------------- */
  annotationWorkspace: image(
    "annotation-workspace.webp",
    4 / 3,
    "Annotation interface — media canvas, timecode scrubber and timestamped action labels.",
    "Annotation interface showing media, a timecode scrubber and timestamped action labels.",
  ),
  reviewWorkspace: image(
    "review-workspace.webp",
    4 / 3,
    "Annotation review interface — source media beside the submitted labels, a rubric panel and review decisions.",
    "Annotation review interface comparing a source media against submitted labels with a rubric panel.",
  ),
  datasetExport: image(
    "dataset-export.webp",
    4 / 3,
    "Dataset export preview — accepted annotation records, schema version, quality report and provenance manifest.",
    "Dataset export preview listing accepted annotation records, schema version, quality report and manifest.",
  ),

  /* ---- Landing: product showcase ------------------------------------ */
  productShowcase: image(
    "product-overview.webp",
    16 / 10,
    "A real screenshot of the Zeno application — the buyer job dashboard.",
    "The Zeno buyer dashboard showing active jobs, task states and quality signals.",
  ),

  /* ---- Landing: use cases ------------------------------------------- */
  useCaseManipulation: image(
    "robotics-manipulation.webp",
    3 / 2,
    "Robotic arm grasping an object from a work surface.",
    "Robotic arm grasping an object from a work surface.",
  ),
  useCaseHumanoid: image(
    "humanoid-embodied.webp",
    3 / 2,
    "Humanoid robot operating in a warehouse environment.",
    "Humanoid robot operating in a warehouse environment.",
  ),
  useCaseIndustrial: image(
    "industrial-robotics.webp",
    3 / 2,
    "Industrial workcell with robot arms on a production line.",
    "Industrial workcell with robot arms on a production line.",
  ),
  useCaseAutonomous: image(
    "autonomous-systems.webp",
    3 / 2,
    "Autonomous mobile robot navigating a mixed-use indoor space.",
    "Autonomous mobile robot navigating a mixed-use indoor space.",
  ),

  /* ---- Trust & provenance ------------------------------------------- */
  provenanceDiagram: image(
    "provenance-manifest.webp",
    16 / 10,
    "A provenance manifest view — dataset version, schema version, source references and accepted-version counts.",
    "A dataset provenance manifest showing dataset version, schema version and accepted-version counts.",
  ),

  /* ---- Product app media -------------------------------------------- */
  taskClip: video(
    "task-segment.mp4",
    "task-segment-poster.webp",
    16 / 9,
    "The single task segment a contributor is assigned to annotate.",
    "A short video clip queued for annotation.",
  ),
} satisfies Record<string, MediaAsset>;

export type MediaKey = keyof typeof media;

/** Convenience for the "asset not supplied yet" state. */
export const isAssetAvailable = (m: MediaAsset): boolean => m.src !== null;

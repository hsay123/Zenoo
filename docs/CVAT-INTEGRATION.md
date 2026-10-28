# CVAT integration — decision and plan

Status: **not integrated.** This document records the decision, the design that
would be used, and the exact things a human must provide before any CVAT code is
written. Nothing here is implemented, and no surface claims CVAT support.

## 1. Where we are

The platform ships its own annotation workspace
(`src/components/product/AnnotationWorkspace.tsx`) and its own schema-backed
payloads:

| Modality | Schema | Editor |
| --- | --- | --- |
| Images | `image-boxes-v1` | draw / move / resize bounding boxes |
| Video | `action-segments-v1` | timeline scrub, timestamped action/failure segments |

Saves go through `PUT /api/tasks/:id/draft`, submissions through
`POST /api/tasks/:id/submit`, and the backend validates every payload against the
schema. The platform is the source of truth; the editor is replaceable.

There is no CVAT code, dependency, host, or credential anywhere in the repo
(`grep -ri cvat` returns nothing outside this file).

## 2. Why it is not integrated yet

An integration that cannot be run and verified would violate the project's own
rules: no fake integrations, no "connected" states that are not real. To do this
honestly we need a running CVAT instance to point at. That is a hosting and
credentials decision only a human can make (see §6).

## 3. What CVAT would add

- Specialist tools for hard cases (keypoints, polygons, cuboids, 3D).
- A second reviewer-facing surface with CVAT's own navigation and filters.
- Familiar tooling for buyers who already annotate in CVAT.

The MVP scope is images and video only. CVAT features outside that (3D, audio,
text) are explicitly out of scope.

## 4. Integration design (recommended)

Keep the platform authoritative and put CVAT behind an adapter, so the existing
workspace and CVAT are interchangeable per job and the platform never depends on
CVAT being up.

```
src/lib/annotation/tool.ts        // interface (native is the default impl)
  createTask(input): Promise<{ externalId, url }>
  openUrl(externalId): string       // where a contributor goes to annotate
  fetchAnnotations(externalId): Promise<AnnotationPayload>  // validated, then submitted
```

- **Source of truth stays the platform.** CVAT annotations are fetched and
  validated against the same schema before they become a submission. A CVAT
  "success" is not a platform "submitted" or "accepted".
- **Feature flag.** `CVAT_BASE_URL` (server-side only). When unset, the native
  workspace is used, exactly as today. No partial "CVAT mode".
- **Server-side calls only.** The backend talks to the CVAT REST API with a
  scoped token; the browser never holds CVAT credentials.
- **Media reachability.** CVAT must be able to fetch the task media. Use the
  existing short-lived signed URLs (or a CVAT remote-storage entry for the
  Supabase bucket), never public object URLs.
- **Identity.** Exports and receipts already exclude contributor identity; the
  CVAT adapter must not introduce contributor PII into stored annotations.

### Concept mapping

| Platform | CVAT |
| --- | --- |
| `jobs` row | CVAT project / task |
| `tasks` row | CVAT job |
| `label_list` | CVAT labels |
| `image-boxes-v1` | `rectangle` shapes |
| `action-segments-v1` | track interval + per-segment attributes (action, outcome, object, failure_reason, confidence) |
| draft save | CVAT job save |
| submit | fetch annotations → validate → `POST /submit` |

## 5. Staged plan (when unblocked)

1. Spike against a real CVAT instance: create a project, push an image task and
   a video task, read annotations back. Record the raw API shapes in this doc.
2. Implement `tool.ts` with the native implementation behind the interface; no
   behaviour change (`CVAT_BASE_URL` unset).
3. Add the CVAT implementation: create task, map labels, stream sign URLs, fetch
   and validate annotations. Cover it with unit tests against recorded CVAT
   responses (no live calls in CI).
4. Wire one job end to end behind the flag and verify with a real contributor
   task: annotation → submit → review → accept → receipt.
5. Only then expose a CVAT affordance in the UI, worded as the real state.

### Acceptance criteria

- Unset flag ⇒ zero behaviour change versus today.
- A CVAT round-trip yields a payload that passes the same schema validation as
  the native editor, and appears as a normal submission.
- No contributor identity in the exported dataset or receipt.
- No live network call in the test suite.

## 6. Required from a human to unblock

1. A reachable **CVAT base URL** (self-hosted or cloud) for staging and dev.
2. **Credentials**: a service account/token for the backend, scoped to the
   projects it needs.
3. Network reachability between the `zeno-api` deployment and that CVAT host, and
   between CVAT and the Supabase Storage bucket (or approval to use signed URLs).
4. A decision: embed CVAT (iframe) or hand off (open in a new tab).

Until these exist, the platform's native workspace is the supported editor, and
it is presented as such — not as CVAT.

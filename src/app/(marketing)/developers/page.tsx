import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Prose } from "@/components/marketing/Prose";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Developers",
  description:
    "The Zeno Data API: pull accepted labels in COCO, YOLO or JSON, filtered and split for training, with no bulk downloads.",
};

const API = process.env.NEXT_PUBLIC_DATA_API_URL ?? "https://zenolab-api.vercel.app";

const yolo = `import os, pathlib, requests

ZENO, KEY = "${API}", os.environ["ZENO_API_KEY"]
H = {"Authorization": f"Bearer {KEY}"}
params = {"format": "yolo", "split": "train:0.8,val:0.2", "media": "signed_url", "limit": 500}
cursor = None
while True:
    page = requests.get(f"{ZENO}/api/v1/datasets/<id>/labels", headers=H,
                        params={**params, **({"cursor": cursor} if cursor else {})}).json()
    for item in page["data"]:
        split = item.get("split", "train")
        for d in ("images", "labels"):
            pathlib.Path(f"zeno-yolo/{d}/{split}").mkdir(parents=True, exist_ok=True)
        pathlib.Path(f"zeno-yolo/images/{split}/{item['asset_id']}.png").write_bytes(
            requests.get(item["media_url"]).content)
        pathlib.Path(f"zeno-yolo/labels/{split}/{item['file']}").write_text("\\n".join(item["lines"]) + "\\n")
    cursor = page["next_cursor"]
    if not cursor:
        break
print("classes:", page["meta"]["classes"])`;

const params: Array<[string, string, string]> = [
  ["format", "zeno · coco · yolo", "Page shape (coco/yolo for image datasets)"],
  ["classes", "cup,hand", "Keep only these classes"],
  ["rename", "cup:mug", "Rename classes on the way out"],
  ["bbox", "xywh · xyxy · normalized", "Box coordinates"],
  ["split", "train:0.8,val:0.2", "Deterministic per-asset split"],
  ["since", "2026-10-29T00:00:00Z", "Incremental sync"],
  ["reviewer", "human · ai", "Filter by reviewer type"],
  ["fields", "asset_id,boxes,split", "Return only these fields"],
  ["media", "signed_url", "15-minute link to each image or video"],
  ["limit / cursor", "500 / next_cursor", "Pagination (max 1000 per page)"],
];

export default function DevelopersPage() {
  return (
    <>
      <PageIntro
        eyebrow="Developers"
        title="The Zeno Data API"
        lead="Ask for exactly the labels your model needs, already in the format your training code reads. No bulk downloads, no reshaping scripts."
      />
      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <div className="mb-10 flex flex-wrap gap-3">
            <ButtonLink href="/workspace/buyer/api">Get an API key</ButtonLink>
            <ButtonLink href={`${API}/api/v1/openapi.json`} variant="secondary">
              OpenAPI spec
            </ButtonLink>
          </div>
          <Prose>
            <h2>How it works</h2>
            <ol>
              <li>
                Subscribe to the <strong>API plan ($299/month)</strong> from <em>Buyer → API</em>. During
                Hacker House Goa 2026 checkout runs in Dodo Payments&apos; test mode.
              </li>
              <li>
                Create a key (<code>zeno_test_…</code>). It is shown once and reads only your
                organization&apos;s datasets.
              </li>
              <li>
                Call <code>GET /api/v1/datasets</code>, then <code>/api/v1/datasets/&#123;id&#125;/labels</code>{" "}
                with the shape you want. Large pulls stream from <code>/labels/stream</code> as NDJSON or CSV.
              </li>
            </ol>
            <p>
              Only accepted, reviewed labels are returned, never any contributor identity. Every label carries
              its on-chain payout receipt.
            </p>
            <h2>Parameters</h2>
          </Prose>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-muted text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Parameter</th>
                  <th className="px-4 py-2.5 font-medium">Example</th>
                  <th className="px-4 py-2.5 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {params.map(([name, example, meaning]) => (
                  <tr key={name}>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink">{name}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink-3">{example}</td>
                    <td className="px-4 py-2.5 text-ink-2">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-10">
            <Prose>
              <h2>Train YOLOv8 in one loop</h2>
            </Prose>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-sunken p-5 font-mono text-[12px] leading-relaxed text-ink-2">
              {yolo}
            </pre>
          </div>
          <div className="mt-10">
            <Prose>
              <h2>Errors and limits</h2>
              <p>
                <code>401</code> bad or revoked key · <code>402</code> no active API plan · <code>404</code> not
                your dataset · <code>422</code> a bad parameter (the message names it) · <code>429</code> over 600
                requests a minute per key.
              </p>
            </Prose>
          </div>
        </Container>
      </Section>
    </>
  );
}

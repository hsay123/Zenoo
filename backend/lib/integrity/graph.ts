/**
 * Duplicate-account / integrity detection (HHG F6.2) — pure graph logic.
 *
 * Accounts are linked when they share something that should belong to one
 * person or job:
 *   - wallet_link     a wallet used by two accounts (a contributor's payout
 *                     wallet is also a buyer's job-funding wallet);
 *   - duplicate_work  two accounts submitted identical label content on the
 *                     same asset (copied answers).
 * Linked accounts form clusters (union-find). Two further signals use them:
 *   - self_dealing    a contributor's accepted work is on a job owned by
 *                     themselves or an account in their cluster (paid from
 *                     their own escrow — wash activity);
 *   - linked_review   a reviewer decided work of an account in their cluster.
 *
 * The same rules run either in-process (this file) or as installed GSQL
 * queries on TigerGraph (`tigergraph/`); both produce `IntegrityFlag`s.
 * Flags route work to humans — they never block or move money by themselves.
 */

export type IntegritySignal = "wallet_link" | "duplicate_work" | "self_dealing" | "linked_review";

export interface IntegrityFlag {
  user_id: string;
  related_user_id: string | null;
  signal: IntegritySignal;
  evidence: Record<string, unknown>;
}

export interface IntegrityInput {
  /** Every account with its payout wallet (if any). */
  accounts: { id: string; wallet_address: string | null }[];
  /** Jobs with their owner (buyer) and the wallet that funded them. */
  jobs: { id: string; buyer_id: string; funding_wallet_address: string | null }[];
  /** Latest submission per (contributor, task). */
  submissions: {
    id: string;
    contributor_id: string;
    task_id: string;
    asset_id: string;
    job_id: string;
    /** Hash of the label content only (task/asset ids stripped). */
    content_hash: string;
    /** False for an empty submission (no boxes/segments) — never "duplicate". */
    has_content: boolean;
    status: string;
  }[];
  /** Human review decisions. */
  reviews: { submission_id: string; reviewer_id: string }[];
}

const norm = (wallet: string | null | undefined) => {
  const w = (wallet ?? "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(w) ? w : null;
};

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
}

/** A directed link from one account to another (both directions are emitted). */
export interface AccountLink {
  a: string;
  b: string;
  signal: "wallet_link" | "duplicate_work";
  evidence: Record<string, unknown>;
}

/**
 * The traversal part: account pairs linked through a shared wallet or
 * identical work on the same asset. This is what TigerGraph's installed
 * queries compute (`tigergraph/queries.gsql`); `findLinks` is the in-process
 * equivalent.
 */
export function findLinks(input: IntegrityInput): AccountLink[] {
  const links: AccountLink[] = [];

  // ── wallet_link ───────────────────────────────────────────────
  const walletUsers = new Map<string, Map<string, string>>(); // wallet -> user -> how
  const recordWallet = (wallet: string | null, user: string, how: string) => {
    const w = norm(wallet);
    if (!w) return;
    if (!walletUsers.has(w)) walletUsers.set(w, new Map());
    const users = walletUsers.get(w)!;
    if (!users.has(user)) users.set(user, how);
  };
  for (const a of input.accounts) recordWallet(a.wallet_address, a.id, "payout wallet");
  for (const j of input.jobs) recordWallet(j.funding_wallet_address, j.buyer_id, `funded job ${j.id}`);
  for (const [wallet, users] of walletUsers) {
    const ids = [...users.keys()];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        links.push({
          a,
          b,
          signal: "wallet_link",
          evidence: { wallet, this_account: users.get(a), other_account: users.get(b) },
        });
      }
    }
  }

  // ── duplicate_work ────────────────────────────────────────────
  const byContent = new Map<string, Map<string, { submission_id: string; task_id: string }>>();
  for (const s of input.submissions) {
    if (!s.has_content) continue;
    const key = `${s.asset_id}|${s.content_hash}`;
    if (!byContent.has(key)) byContent.set(key, new Map());
    const by = byContent.get(key)!;
    if (!by.has(s.contributor_id)) by.set(s.contributor_id, { submission_id: s.id, task_id: s.task_id });
  }
  for (const [key, by] of byContent) {
    const ids = [...by.keys()];
    if (ids.length < 2) continue;
    const [asset_id] = key.split("|");
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        links.push({
          a,
          b,
          signal: "duplicate_work",
          evidence: {
            asset_id,
            this_submission: by.get(a)!.submission_id,
            other_submission: by.get(b)!.submission_id,
          },
        });
      }
    }
  }
  return links;
}

/**
 * Flags from links: the links themselves, plus self_dealing and
 * linked_review over the clusters the links form.
 */
export function detectIntegrityFlags(
  input: IntegrityInput,
  links: readonly AccountLink[] = findLinks(input),
): IntegrityFlag[] {
  const flags = new Map<string, IntegrityFlag>();
  const add = (flag: IntegrityFlag) => {
    const key = `${flag.user_id}|${flag.signal}|${flag.related_user_id ?? ""}`;
    if (!flags.has(key)) flags.set(key, flag);
  };
  const uf = new UnionFind();
  for (const link of links) {
    if (link.a === link.b) continue;
    uf.union(link.a, link.b);
    add({ user_id: link.a, related_user_id: link.b, signal: link.signal, evidence: link.evidence });
  }

  // ── self_dealing ──────────────────────────────────────────────
  const jobBuyer = new Map(input.jobs.map((j) => [j.id, j.buyer_id]));
  const linked = (a: string, b: string) => a === b || uf.find(a) === uf.find(b);
  for (const s of input.submissions) {
    if (s.status !== "accepted" && s.status !== "paid") continue;
    const buyer = jobBuyer.get(s.job_id);
    if (!buyer || !linked(s.contributor_id, buyer)) continue;
    add({
      user_id: s.contributor_id,
      related_user_id: buyer === s.contributor_id ? null : buyer,
      signal: "self_dealing",
      evidence: {
        job_id: s.job_id,
        submission_id: s.id,
        reason: buyer === s.contributor_id ? "labelled own job" : "labelled a linked account's job",
      },
    });
  }

  // ── linked_review ─────────────────────────────────────────────
  const author = new Map(input.submissions.map((s) => [s.id, s.contributor_id]));
  for (const r of input.reviews) {
    const contributor = author.get(r.submission_id);
    if (!contributor || contributor === r.reviewer_id) continue;
    if (!linked(contributor, r.reviewer_id)) continue;
    add({
      user_id: r.reviewer_id,
      related_user_id: contributor,
      signal: "linked_review",
      evidence: { submission_id: r.submission_id },
    });
  }

  return [...flags.values()];
}

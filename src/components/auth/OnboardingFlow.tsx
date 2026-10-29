"use client";

import { useState, useCallback, useEffect, Fragment, useRef } from "react";
import { useCreateWallet, useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Check, Info, AlertTriangle, Clock, ChevronDown, Users } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { useSession } from "@/lib/api/session";
import { meSyncSchema, platformPaths } from "@/lib/api/platform";
import {
  createSubmitGuard,
  describeSelection,
  orgNameIssue,
  submitOnboarding,
} from "@/lib/api/onboarding";

type AccountType = "buyer" | "contributor";

interface Account {
  key: AccountType;
  label: string;
  summary: string;
  setup: string[];
  workspace: string;
  icon: React.ReactNode;
}

const accounts: Account[] = [
  {
    key: "buyer",
    label: "I'm here for my company",
    summary: "Commission and fund annotation jobs, monitor quality and spend, and download versioned datasets.",
    setup: [
      "Create or join an organization",
      "Confirm lawful authority to process each dataset",
      "Define the schema, rubric, reward and deadline",
      "Fund the job before tasks become payable",
    ],
    workspace: "/workspace/buyer",
    icon: <Users className="h-6 w-6" />,
  },
  {
    key: "contributor",
    label: "I'm here to contribute",
    summary: "Claim scoped paid tasks, annotate in the browser, and track submissions, corrections and payouts distinctly.",
    setup: [
      "Complete your profile fields",
      "Review the payout policy and fees",
      "Pass a gold-standard qualification task",
      "See reward, effort and rubric before claiming",
    ],
    workspace: "/workspace/contributor",
    icon: <Users className="h-6 w-6" />,
  },
];

type Step = "choose" | "org-name" | "submitting" | "success" | "error";

export function OnboardingFlow() {
  const { client } = useSession();
  // The signed-in Privy wallet (external, or the embedded one Privy creates on
  // login) is the contributor's payout address. Email sign-ins get theirs just
  // after login, so a contributor without one yet has it created here.
  const { user } = usePrivy();
  const { createWallet } = useCreateWallet();
  // Wallet sign-ins have no email; companies can add one (optional) for card
  // receipts and alerts. The backend picks it up from Privy on onboarding.
  const { linkEmail } = useLinkAccount();
  const signInEmail = user?.email?.address ?? null;
  const walletAddress = user?.wallet?.address;

  const [selected, setSelected] = useState<"buyer" | "contributor" | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgNameError, setOrgNameError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);

  const active = accounts.find((a) => a.key === selected) ?? null;

  const handleOrgNameChange = useCallback((value: string) => {
    setOrgName(value);
    if (orgNameError) setOrgNameError(null);
  }, [orgNameError]);

  const validateOrgName = useCallback((name: string): boolean => {
    const issue = orgNameIssue(name);
    setOrgNameError(issue);
    return issue === null;
  }, []);

  // Serialises submissions: a second click while a request is in flight is a
  // no-op, so a contributor selection can never be POSTed twice.
  const submitGuard = useRef<ReturnType<typeof createSubmitGuard> | null>(null);
  if (submitGuard.current === null) submitGuard.current = createSubmitGuard();

  /**
   * Send the choice to the backend and only advance to success once the API
   * confirms it persisted. Contributor has no extra form, so it is submitted
   * the moment it is selected; buyer is submitted from the organization step.
   */
  const startSubmit = useCallback(
    (accountType: "buyer" | "contributor") => {
      const guard = submitGuard.current!;
      if (guard.busy) return;

      setSelected(accountType);
      setError(null);
      setStep("submitting");

      void guard
        .run(async () => {
          let wallet = walletAddress;
          if (!wallet && accountType === "contributor") {
            wallet = await createWallet()
              .then((created) => created.address)
              .catch(() => undefined);
          }
          return submitOnboarding(client, {
            account_type: accountType,
            organization_name: accountType === "buyer" ? orgName.trim() : undefined,
            wallet_address: wallet,
          });
        })
        .then((result) => {
          if (!result) return; // a request was already in flight
          if (result.status === "success") {
            // Pick up an email or wallet linked during onboarding (best effort).
            void client.post(meSyncSchema, platformPaths.meSync()).catch(() => undefined);
            setStep("success");
            window.setTimeout(() => {
              window.location.href = result.redirect;
            }, 800);
          } else {
            setError(result.message);
            setStep("error");
          }
        });
    },
    [client, orgName, walletAddress, createWallet],
  );

  const handleSubmit = () => {
    if (!selected) return;
    if (selected === "buyer" && !validateOrgName(orgName)) return;
    startSubmit(selected);
  };

  const handleRetry = () => {
    setStep(selected === "buyer" ? "org-name" : "choose");
    setError(null);
  };

  const handleBack = useCallback(() => {
    if (step === "org-name") {
      setStep("choose");
      setOrgNameError(null);
    }
  }, [step]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "choose") {
        handleBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, handleBack]);

  const activeAccount = accounts.find((a) => a.key === selected) ?? null;

  // Pure check, safe to evaluate during render (scheduling state here caused an
  // infinite re-render loop in the buyer organization step).
  const orgNameProblem = orgNameIssue(orgName);

  const progressSteps = [
    { id: "choose", label: "Choose", icon: <svg className="h-5 w-5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 13.5V21a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.5"/><path d="M21 10.5V7.5a2.5 2.5 0 0 0-5 0"/><path d="M21 21a2 2 0 0 0 2-2V9"/><path d="M3 21h18"/></svg> },
    { id: "org-name", label: "Org Name", icon: <svg className="h-5 w-5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 13.5V21a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.5"/><path d="M21 10.5V7.5a2.5 2.5 0 0 0-5 0"/><path d="M21 21a2 2 0 0 0 2-2V9"/><path d="M3 21h18"/></svg> },
    { id: "submitting", label: "Processing", icon: <Clock className="h-5 w-5 mx-auto animate-spin" /> },
    { id: "success", label: "Done", icon: <Check className="h-5 w-5 mx-auto" /> },
  ];

  const isStepActive = (stepId: string) => {
    const stepOrder = ["choose", "org-name", "submitting", "success"];
    const currentIndex = stepOrder.indexOf(step);
    const targetIndex = stepOrder.indexOf(stepId);
    return targetIndex <= currentIndex;
  };

  const isStepConnectorActive = (index: number) => {
    const stepOrder = ["choose", "org-name", "submitting", "success"];
    const currentIndex = stepOrder.indexOf(step);
    return index < currentIndex;
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col">
      <div className="mb-8 hidden lg:block">
        <div className="flex items-center justify-center gap-2">
          {progressSteps.map((s, i) => (
            <Fragment key={s.id}>
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                  isStepActive(s.id) ? "bg-accent-600 text-white" : "bg-line text-ink-4"
                )}
              >
                {s.icon}
              </div>
              {i < 3 && (
                <div
                  className={cn(
                    "w-16 h-0.5 mx-1 transition-colors",
                    isStepConnectorActive(i) ? "bg-accent-600" : "bg-line"
                  )}
                />
              )}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <div className={cn("transition-all duration-300", step === "choose" ? "opacity-100" : "opacity-0 pointer-events-none")}>
            <fieldset className="space-y-6">
              <legend className="text-eyebrow uppercase text-ink-4 flex items-center gap-2">
                <span className="text-accent-600 font-mono">01</span>
                <span>Choose your account type</span>
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                {accounts.map((account) => {
                  const isActive = selected === account.key;
                  return (
                    <button
                      key={account.key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        if (step !== "choose") return;
                        setSelected(account.key);
                        setError(null);
                        // Contributor has no further input: submit for real now
                        // instead of only moving to the "submitting" screen.
                        const next = describeSelection(account.key);
                        if (next.kind === "advance-to-org-name") {
                          setStep("org-name");
                        } else {
                          startSubmit(next.accountType);
                        }
                      }}
                      className={cn(
                        "group relative flex flex-col rounded-2xl border p-6 text-left transition-all duration-300",
                        isActive
                          ? "border-accent-500 bg-accent-50 shadow-[0_0_0_1px_theme(colors.accent.500)]"
                          : "border-line bg-surface hover:border-accent-400 hover:bg-surface-elevated",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                              isActive
                                ? "bg-accent-600 text-white"
                                : "bg-line text-ink-4"
                            )}
                          >
                            {account.icon}
                          </span>
                          <div>
                            <span className="font-display text-title text-ink">
                              {account.label}
                            </span>
                            <span className="text-body-sm text-ink-3 mt-0.5 block">
                              {account.summary}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <div
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                              isActive
                                ? "border-accent-500 bg-accent-600"
                                : "border-line-strong"
                            )}
                          >
                            {isActive && <Check className="h-4 w-4 text-white" />}
                          </div>
                        </div>
                      </div>

                      <div
                        className={cn(
                          "absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none",
                          isActive ? "opacity-100" : ""
                        )}
                      >
                        <div className="absolute inset-0 rounded-2xl border-2 border-accent-400/50" />
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-caption text-ink-4">
                        <ChevronDown className="h-3.5 w-3.5 text-accent-500" />
                        <span>Select to continue</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {selected === "buyer" && step === "org-name" && (
            <div className="transition-all duration-300" style={{ animation: "slideIn 0.3s ease-out" }}>
              <fieldset className="space-y-6">
                <legend className="text-eyebrow uppercase text-ink-4 flex items-center gap-2">
                  <span className="text-accent-600 font-mono">02</span>
                  <span>Organization details</span>
                </legend>

                <div className="rounded-xl border border-line bg-surface p-6">
                  <label
                    htmlFor="org-name"
                    className="block font-medium text-body-sm text-ink mb-2"
                  >
                    Organization name <span className="text-danger-fg">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="org-name"
                      type="text"
                      value={orgName}
                      onChange={(e) => handleOrgNameChange(e.target.value)}
                      onBlur={() => orgName && validateOrgName(orgName)}
                      placeholder="e.g., Acme AI"
                      className={cn(
                        "w-full rounded-lg border bg-white px-4 py-3 text-body text-ink placeholder:text-ink-4 transition-all",
                        orgNameError
                          ? "border-danger-fg focus:border-danger-fg focus:ring-2 focus:ring-danger-fg/20"
                          : "border-line focus:border-accent-500 focus:ring-2 focus:ring-accent-100 focus:outline-none",
                      )}
                      maxLength={100}
                      autoFocus
                      aria-invalid={!!orgNameError}
                      aria-describedby={orgNameError ? "org-name-error" : "org-name-hint"}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 13.5V21a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.5"/><path d="M21 10.5V7.5a2.5 2.5 0 0 0-5 0"/><path d="M21 21a2 2 0 0 0 2-2V9"/><path d="M3 21h18"/></svg>
                    </div>
                  </div>
                  {orgNameError && (
                    <p id="org-name-error" className="mt-2 flex items-center gap-1.5 text-caption text-danger-fg" role="alert">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{orgNameError}</span>
                    </p>
                  )}
                  {!orgNameError && (
                    <p id="org-name-hint" className="mt-2 text-caption text-ink-3">
                      This name identifies your organization on Zeno. You can change it later
                      in the buyer workspace settings.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-line bg-surface-muted p-4 text-body-sm">
                  {signInEmail ? (
                    <p className="text-ink-3">
                      Receipts and alerts go to <span className="text-ink">{signInEmail}</span>.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-ink-3">
                        Email <span className="text-ink-4">(optional)</span>: for card receipts and account alerts.
                      </p>
                      <Button size="sm" variant="secondary" type="button" onClick={() => linkEmail()}>
                        Add an email
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={handleBack}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={orgNameProblem !== null}
                    className="flex-1"
                  >
                    Continue to buyer workspace
                  </Button>
                </div>
              </fieldset>
            </div>
          )}

          {step === "submitting" && (
            <div className="transition-all duration-300 text-center py-12" style={{ animation: "fadeIn 0.3s ease-out" }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-50 mb-6">
                <Clock className="h-8 w-8 text-accent-600 animate-spin" aria-hidden />
              </div>
              <h2 className="font-display text-display-sm text-ink mb-2">
                Setting up your {activeAccount?.label.toLowerCase() || "account"}...
              </h2>
              <p className="text-body text-ink-3 max-w-md mx-auto">
                Creating your account{selected === "buyer" ? " and organization" : ""}. This usually takes just a few seconds.
              </p>
            </div>
          )}

          {step === "success" && (
            <div className="transition-all duration-300 text-center py-12" style={{ animation: "fadeIn 0.3s ease-out" }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mb-6">
                <Check className="h-8 w-8 text-emerald-600" aria-hidden />
              </div>
              <h2 className="font-display text-display-sm text-ink mb-2">
                You&apos;re all set!
              </h2>
              <p className="text-body text-ink-3 max-w-md mx-auto mb-6">
                Your {activeAccount?.label.toLowerCase() || "account"} has been created. Redirecting to your workspace...
              </p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-accent-600 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="transition-all duration-300" style={{ animation: "shake 0.4s ease-out" }}>
              <div className="rounded-xl border border-danger-line bg-danger-bg p-5 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-fg" />
                  <div className="flex-1">
                    <p className="font-medium text-ink mb-1">Something went wrong</p>
                    <p className="text-body-sm text-danger-fg">{error}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={handleRetry}
                  className="flex-1"
                >
                  Try again
                </Button>
                <Button
                  size="lg"
                  onClick={handleBack}
                  className="flex-1"
                >
                  Go back
                </Button>
              </div>
            </div>
          )}

          <div className="mt-10 grid gap-3 sm:grid-cols-2 pt-6 border-t border-line">
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted p-4">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
              <p className="text-caption text-ink-3">
                Your account type is stored on the platform when you continue, and you
                won&apos;t be asked again. Reviewer and admin access are granted by the
                platform, never chosen here.
              </p>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted p-4">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
              <p className="text-caption text-ink-3">
                Your choice is saved to your account. You won&apos;t see this screen again.
              </p>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="sticky top-24 space-y-6">
            <div className="rounded-2xl border border-line bg-surface p-6">
              <p className="text-eyebrow uppercase text-ink-4 mb-4">
                Setup preview
              </p>

              {active ? (
                <>
                  <div className="mb-4 flex items-center gap-2">
                    <h2 className="font-display text-display-sm text-ink">
                      {active.label}
                    </h2>
                    <Badge tone="accent">Selected</Badge>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {active.setup.map((item) => (
                      <li key={item} className="flex items-start gap-3 group">
                        <div className="relative flex-shrink-0">
                          <div className="w-6 h-6 rounded-full border border-line flex items-center justify-center transition-colors group-hover:border-accent-500 group-hover:bg-accent-50">
                            <Check
                              className="h-3 w-3 text-accent-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-hidden
                            />
                          </div>
                        </div>
                        <span className="text-body-sm text-ink-2 leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    size="lg"
                    disabled={step === "submitting" || (selected === "buyer" && !orgName.trim())}
                    onClick={handleSubmit}
                  >
                    {step === "submitting" ? (
                      <>
                        <Clock className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Processing...
                      </>
                    ) : (
                      `Continue to ${active.label.toLowerCase()} workspace`
                    )}
                  </Button>
                  <p className="mt-3 text-caption text-ink-4 text-center">
                    Opens your live workspace, connected to the platform API.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-4 font-display text-display-sm text-ink-3 text-center">
                    Select an account type to see its setup.
                  </h2>
                  <ul className="mt-6 space-y-3 opacity-60">
                    {["Your account&apos;s setup steps", "What access it grants", "The workspace that opens"].map(
                      (item) => (
                        <li key={item} className="flex items-start gap-2.5 text-center justify-center">
                          <span
                            aria-hidden
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-4"
                          />
                          <span className="text-body-sm text-ink-4">{item}</span>
                        </li>
                      ),
                    )}
                  </ul>
                  <Button className="mt-6 w-full" size="lg" disabled>
                    Continue to workspace
                  </Button>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-medium text-body-sm text-ink mb-3">Why Zeno?</h3>
              <ul className="space-y-2 text-caption text-ink-3">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  <span>Verified data quality through multi-stage review</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  <span>Transparent payouts with on-chain settlement receipts</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  <span>Paid in USDC on Base — to your Zeno wallet or Cake Wallet</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  <span>Flexible schemas for image and video annotation</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  <span>Privacy-first: no contributor identity in exports</span>
                </li>
              </ul>
            </div>
          </div>
        </aside>

        {error && step !== "error" && (
          <div
            className="fixed bottom-4 right-4 z-50 animate-slide-up"
            role="alert"
          >
            <div className="flex items-center gap-3 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 shadow-lg max-w-md">
              <AlertTriangle className="h-5 w-5 text-danger-fg flex-shrink-0" />
              <span className="text-body-sm text-danger-fg flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-danger-fg hover:text-danger-fg/70 p-1"
                aria-label="Dismiss error"
              >
                <span aria-hidden className="text-base leading-none">
                  ✕
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
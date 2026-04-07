import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentMascot } from "@/components/shared/agent-mascot/agent-mascot";
import { useFocusTrap } from "@/hooks/use-focus-trap";

const INTERACTIVE = "a, button, input, select, textarea, [role='button']";
const ONBOARDING_KEY = "hk-onboarding-completed";

export function useOnboarding() {
  const [show, setShow] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) !== "done",
  );
  const complete = () => {
    localStorage.setItem(ONBOARDING_KEY, "done");
    setShow(false);
  };
  return { show, complete };
}

interface OnboardingProps {
  onComplete: () => void;
}

const TOTAL_STEPS = 3;

/* ── Shared shimmer style for headline keywords ── */
const shimmerStyle = {
  background:
    "linear-gradient(90deg, var(--primary), color-mix(in oklch, var(--primary) 45%, white), var(--primary))",
  backgroundSize: "200% auto",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  animation: "text-shimmer 4s ease-in-out infinite",
} as const;

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Mouse parallax ── */
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    setMouse({ x, y });
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useFocusTrap(containerRef, visible);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest(INTERACTIVE)) return;
      e.preventDefault();
      getCurrentWindow().startDragging();
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleMouseMove]);

  const show = visible && !exiting;
  const isLast = step === TOTAL_STEPS - 1;

  const handleNext = () => {
    if (isLast) {
      setExiting(true);
      setTimeout(onComplete, 400);
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-300 overflow-hidden"
      style={{ opacity: show ? 1 : 0 }}
    >
      {/* ── Animated gradient mesh background ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          transform: `translate(${mouse.x * 12}px, ${mouse.y * 12}px)`,
          transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            width: "55%",
            height: "55%",
            top: "8%",
            left: "22%",
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)",
            filter: "blur(70px)",
            animation: "mesh-drift-1 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: "45%",
            height: "45%",
            top: "25%",
            right: "8%",
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--accent) 12%, transparent), transparent 70%)",
            filter: "blur(60px)",
            animation: "mesh-drift-2 10s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: "40%",
            height: "50%",
            bottom: "5%",
            left: "10%",
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 8%, transparent), transparent 70%)",
            filter: "blur(60px)",
            animation: "mesh-drift-3 14s ease-in-out infinite",
          }}
        />
      </div>

      {/* Progress dots */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setStep(i)}
            className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
              i === step
                ? "w-8 bg-primary"
                : i < step
                  ? "w-2 bg-primary/40 hover:bg-primary/70 hover:w-4"
                  : "w-2 bg-border hover:bg-muted-foreground/40 hover:w-4"
            }`}
            aria-label={`Step ${i + 1}`}
          />
        ))}
      </div>

      {/* Content — subtle counter-parallax */}
      <div
        key={step}
        className="relative flex flex-col items-center text-center px-8"
        style={{
          maxWidth: 720,
          transform: `translate(${mouse.x * -3}px, ${mouse.y * -3}px)`,
          transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
          animation: "entrance-spring 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        {step === 0 && <StepWelcome />}
        {step === 1 && <StepUnified />}
        {step === 2 && <StepTrust />}

        <button
          onClick={handleNext}
          className="mt-10 flex items-center gap-2 rounded-xl bg-primary px-7 py-2.5 text-[14px] font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
        >
          {isLast ? "Get Started" : "Next"}
          <ArrowRight size={15} className="opacity-60" />
        </button>
      </div>
    </div>
  );
}

/* ── Step 0: Welcome ── */

const AGENTS = [
  "claude", "codex", "gemini", "cursor", "antigravity", "copilot",
] as const;
const FLOAT_DELAYS = [0, 0.4, 0.9, 1.3, 0.6, 1.1];

function StepWelcome() {
  return (
    <>
      <div className="relative mb-12">
        <div className="relative flex items-center justify-center gap-4">
          {AGENTS.map((name, i) => (
            <div
              key={name}
              style={{
                animation: `onboarding-float 3s ease-in-out ${FLOAT_DELAYS[i]}s infinite, fade-in 500ms ease-out ${i * 100}ms both`,
              }}
            >
              <AgentMascot name={name} size={52} />
            </div>
          ))}
        </div>
      </div>

      <h1 className="font-serif text-[44px] font-semibold tracking-tight leading-[1.1] text-foreground">
        Welcome to <span style={shimmerStyle}>HarnessKit</span>
      </h1>

      <p className="mt-3 text-[15px] font-medium text-primary/70">
        One home for every agent
      </p>

      <p className="mt-7 max-w-[440px] text-[15px] leading-[1.75] text-muted-foreground">
        You run multiple AI coding agents — each scatters its extensions,
        configs, and rules across different directories, in different formats.
      </p>

      <p className="mt-5 text-[15.5px] font-semibold text-primary/80">
        HarnessKit is the control center for all of it.
      </p>
    </>
  );
}

/* ── Step 1: Everything, unified ── */

const EXT_TYPES = [
  { label: "Skills", kind: "skill" },
  { label: "MCP Servers", kind: "mcp" },
  { label: "Plugins", kind: "plugin" },
  { label: "Hooks", kind: "hook" },
  { label: "Agent CLIs", kind: "cli" },
] as const;

const AGENT_FILES = ["Configs", "Memory", "Rules", "Ignore"] as const;

function StepUnified() {
  return (
    <>
      {/* Glass card — stacked rows, centered */}
      <div
        className="mb-8 flex flex-col items-center rounded-2xl px-8 py-6"
        style={{
          animation: "entrance-spring 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
          background: "color-mix(in oklch, var(--card) 70%, transparent)",
          border: "1px solid color-mix(in oklch, var(--primary) 8%, transparent)",
          boxShadow: "0 4px 24px -4px color-mix(in oklch, var(--primary) 8%, transparent), 0 1px 3px color-mix(in oklch, var(--primary) 4%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        {/* Extensions — primary purple */}
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-primary/40">
          Extensions
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {EXT_TYPES.map(({ label, kind }, i) => (
            <span
              key={kind}
              className="rounded-md px-3 py-1 text-[12.5px] font-medium text-primary/80"
              style={{
                animation: `scale-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 50 + 100}ms both`,
                background: "color-mix(in oklch, var(--primary) 8%, transparent)",
                border: "1px solid color-mix(in oklch, var(--primary) 12%, transparent)",
              }}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="h-4" />

        {/* Agent Files — teal, equally strong */}
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "oklch(0.55 0.08 175 / 0.55)" }}>
          Agent Files
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {AGENT_FILES.map((label, i) => (
            <span
              key={label}
              className="rounded-md px-3 py-1 text-[12.5px] font-medium"
              style={{
                animation: `scale-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) ${(i + EXT_TYPES.length) * 50 + 100}ms both`,
                color: "oklch(0.48 0.08 175)",
                background: "oklch(0.55 0.08 175 / 0.08)",
                border: "1px solid oklch(0.55 0.08 175 / 0.15)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <h1 className="font-serif text-[44px] font-semibold tracking-tight leading-[1.1] text-foreground">
        All your agents,{" "}
        <span style={shimmerStyle}>one view</span>
      </h1>

      <div className="mt-7 flex flex-col gap-2.5">
        {[
          { text: "One click to deploy across agents", delay: 100 },
          { text: "Format differences handled automatically", delay: 200 },
          { text: "Config files auto-discovered in real time", delay: 300 },
        ].map(({ text, delay }) => (
          <div
            key={text}
            className="flex items-center gap-3 rounded-xl px-4 py-2.5"
            style={{
              width: 320,
              animation: `slide-in-right 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both, card-breathe 3s ease-in-out ${1200 + delay}ms infinite`,
              background: "color-mix(in oklch, var(--primary) 4%, var(--card))",
              border: "1px solid color-mix(in oklch, var(--primary) 10%, transparent)",
              boxShadow: "0 1px 4px -1px color-mix(in oklch, var(--primary) 8%, transparent)",
            }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
            <span className="text-[14px] text-foreground/65">{text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Step 2: Trust, built in ── */

function StepTrust() {
  return (
    <>
      {/* Mock audit card — shows what the trust score looks like */}
      <div
        className="relative mb-8 rounded-2xl px-6 py-5"
        style={{
          animation: "entrance-spring 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
          background: "color-mix(in oklch, var(--card) 70%, transparent)",
          border: "1px solid color-mix(in oklch, var(--primary) 8%, transparent)",
          boxShadow: "0 4px 24px -4px color-mix(in oklch, var(--primary) 8%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >

        <div className="flex items-center gap-5">
          {/* Trust ring — smaller, in context */}
          <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
            <svg viewBox="0 0 80 80" width={80} height={80}>
              <circle
                cx={40} cy={40} r={34}
                fill="none" stroke="var(--border)" strokeWidth={3} opacity={0.4}
              />
              <circle
                cx={40} cy={40} r={34}
                fill="none" stroke="var(--primary)" strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={214}
                strokeDashoffset={214}
                style={{
                  transform: "rotate(-90deg)",
                  transformOrigin: "center",
                  animation: "trust-ring-fill-full 1.2s ease-out 0.4s forwards",
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-bold text-foreground leading-none">100</span>
              <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-primary">Safe</span>
            </div>
          </div>

          {/* Abstract info + real audit result */}
          <div className="flex flex-col gap-2 text-left">
            <div className="h-2.5 w-28 rounded-full bg-foreground/10" />
            <div className="h-2 w-20 rounded-full bg-foreground/6" />
            <div className="mt-1 text-[13px] font-medium text-muted-foreground/60">
              17 rules passed · 0 findings
            </div>
          </div>
        </div>
      </div>

      <h1 className="font-serif text-[44px] font-semibold tracking-tight leading-[1.1] text-foreground">
        Trust,{" "}
        <span style={shimmerStyle}>built in</span>
      </h1>

      <div className="mt-7 flex flex-col gap-2.5">
        {[
          { text: "One-click audit across all extensions", delay: 100 },
          { text: "Exact file and line for every finding", delay: 200 },
          { text: "Non-destructive — your files never move", delay: 300 },
        ].map(({ text, delay }) => (
          <div
            key={text}
            className="flex items-center gap-3 rounded-xl px-4 py-2.5"
            style={{
              width: 320,
              animation: `slide-in-right 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delay + 400}ms both, card-breathe 3s ease-in-out ${1600 + delay}ms infinite`,
              background:
                "color-mix(in oklch, var(--primary) 4%, var(--card))",
              border:
                "1px solid color-mix(in oklch, var(--primary) 10%, transparent)",
              boxShadow:
                "0 1px 4px -1px color-mix(in oklch, var(--primary) 8%, transparent)",
            }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
            <span className="text-[14px] text-foreground/65">{text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

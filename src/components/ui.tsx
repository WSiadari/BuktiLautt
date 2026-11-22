import { useEffect, useRef, useState, useId, type ReactNode } from "react";
export function Icon({
  name = "arrow",
  size = 20,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    arrow: <path d="m9 5 7 7-7 7M4 12h12" />,
    "arrow-left": <path d="m12 5-7 7 7 7M5 12h15" />,
    user: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    report: <path d="M4 7h16v14H4zM3 3h18v4H3zM9 11h6" />,
    people: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M13 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0m3-4a4 4 0 0 1 0 8" />,
    camera: (
      <>
        <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
        <circle cx="12" cy="13.5" r="3.6" />
      </>
    ),
    sparkle: (
      <path d="M12 3c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Zm6.5 11c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z" />
    ),
    scale: (
      <path d="M12 4v16M7 20h10M5 8h14M5 8l-3 7a3 3 0 0 0 6 0L5 8Zm14 0-3 7a3 3 0 0 0 6 0l-3-7ZM12 4a1.5 1.5 0 1 0 0 .01" />
    ),
    receipt: (
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Zm3 5h6M9 11h6M9 14h4" />
    ),
    compare: <path d="M7 4v16M17 4v16M4 8h6M14 16h6M4 8l3-4 3 4M14 16l3 4 3-4" />,
    play: <path d="M8 5v14l11-7L8 5Z" />,
    text: <path d="M4 6h16M4 12h16M4 18h10" />,
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    source: (
      <>
        <path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6" />
      </>
    ),
    wave: (
      <>
        <path d="M3 9c3-6 6 6 9 0s6 6 9 0M3 16c3-6 6 6 9 0s6 6 9 0" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chat: (
      <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 1 1 19 0ZM7 10h10M7 14h6" />
    ),
    print: (
      <>
        <path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 10 18H2zM12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  canClose = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  canClose?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function finishClose() {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null;
    onClose();
  }
  function requestClose() {
    if (closing || !canClose) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    exitTimer.current = setTimeout(finishClose, 170);
  }
  const [opener] = useState(() => {
    const element =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return { element, label: element?.getAttribute("aria-label") };
  });
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (d.open) d.close();
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return;
        const original = opener.element;
        const replacement = opener.label
          ? Array.from(
              document.querySelectorAll<HTMLElement>("[aria-label]"),
            ).find((node) => node.getAttribute("aria-label") === opener.label)
          : null;
        const target = original?.isConnected
          ? original
          : replacement ||
            document.querySelector<HTMLElement>(
              ".ombak-dock, .chat-launcher, .header-ombak",
            );
        if (target?.getClientRects().length) target.focus();
      });
    };
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      className={`${wide ? "modal wide" : "modal"} ${closing ? "modal-closing" : ""}`}
      onAnimationEnd={(e) => {
        if (
          closing &&
          e.target === ref.current &&
          e.animationName === "modal-exit"
        )
          finishClose();
      }}
      onKeyDown={(e) => {
        if (closing) {
          e.preventDefault();
          return;
        }
        if (e.key !== "Tab") return;
        const controls = Array.from(
          ref.current!.querySelectorAll<HTMLElement>(
            "button, a[href], input, textarea, select, [tabindex]",
          ),
        ).filter(
          (node) =>
            node.tabIndex >= 0 &&
            !node.matches(":disabled") &&
            node.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls.at(-1);
        const active = document.activeElement;
        if (!first) {
          e.preventDefault();
          ref.current!.focus();
          return;
        }
        if (
          e.shiftKey &&
          (active === first || !controls.includes(active as HTMLElement))
        ) {
          e.preventDefault();
          last!.focus();
        } else if (
          !e.shiftKey &&
          (active === last || !controls.includes(active as HTMLElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Tutup"
          onClick={requestClose}
          disabled={!canClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

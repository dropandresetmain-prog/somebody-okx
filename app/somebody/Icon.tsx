import type { ReactNode } from "react";
import type { Channel } from "../../lib/procurement/types";

// One stroke icon set (24px grid, 1.75 stroke, round caps). Generic glyphs only —
// no third-party brand logos. See DESIGN.md → "Iconography".
export type IconName =
  | "arrow"
  | "check"
  | "clock"
  | "alert"
  | "changed"
  | "lock"
  | "plus"
  | "close"
  | "sliders"
  | "globe"
  | "mail"
  | "chat"
  | "camera"
  | "ledger"
  | "coffee"
  | "laptop"
  | "phone"
  | "clipboard"
  | "document"
  | "pen"
  | "stamp"
  | "hand"
  | "hourglass"
  | "search"
  | "mic"
  | "stop"
  | "speaker"
  | "send";

const PATHS: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21 19.5H3L12 3.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  changed: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5Z" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  chat: (
    <path d="M5 18.5 3.8 21l3.6-1.3A8.5 8.5 0 1 0 5 18.5Z" />
  ),
  camera: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <path d="M17 7h.01" />
    </>
  ),
  ledger: (
    <>
      <path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14.5H7.5A1.5 1.5 0 0 1 6 18V3.5Z" />
      <path d="M9.5 8h5.5M9.5 11.5h5.5M9.5 15h3" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5" />
    </>
  ),
  laptop: (
    <>
      <rect x="5" y="5" width="14" height="10" rx="1.5" />
      <path d="M3 18.5h18" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.5h2" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="m9 13.5 2 2 4-4" />
    </>
  ),
  document: (
    <>
      <path d="M6.5 3h7l4 4v14h-11V3Z" />
      <path d="M13.5 3v4h4M9.5 12h5M9.5 15.5h5" />
    </>
  ),
  pen: <path d="m14.5 5.5 4 4L9 19H5v-4l9.5-9.5ZM12.5 7.5l4 4" />,
  stamp: (
    <>
      <path d="M9.5 11V8.5a2.5 2.5 0 1 1 5 0V11" />
      <path d="M5 11h14v4H5zM6.5 19.5h11" />
    </>
  ),
  hand: (
    <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 16l-1.4-3.3a1.4 1.4 0 0 1 2.5-1.2L8 14" />
  ),
  hourglass: (
    <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 5-8 8.5s8 4.5 8 8.5" />
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  speaker: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  send: <path d="M4 12h14m-5-5 5 5-5 5" />,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {PATHS[name]}
    </svg>
  );
}

export const CHANNEL_ICON: Record<Channel, IconName> = {
  Web: "globe",
  Gmail: "mail",
  WhatsApp: "chat",
  Instagram: "camera",
};

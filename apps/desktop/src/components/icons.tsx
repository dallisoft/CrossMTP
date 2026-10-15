import { ReactNode } from "react";
import { FileKind } from "../format";

interface IconProps {
  size?: number;
  label?: string;
}

function Stroke({ size = 16, label, width = 1.8, children }: IconProps & { width?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  );
}

export const IconLaptop = (p: IconProps) => (
  <Stroke {...p} width={1.7}>
    <rect x="4" y="5" width="16" height="11" rx="1.5" />
    <path d="M2 19h20" />
  </Stroke>
);

export const IconPhone = (p: IconProps) => (
  <Stroke {...p} width={1.7}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
    <path d="M11 18.5h2" />
  </Stroke>
);

export const IconPhoneOff = (p: IconProps) => (
  <Stroke {...p} width={1.5}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
    <path d="M11 18.5h2M3 3l18 18" />
  </Stroke>
);

export const IconArrowRight = (p: IconProps) => (
  <Stroke {...p} width={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
);

export const IconArrowLeft = (p: IconProps) => (
  <Stroke {...p} width={2}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Stroke>
);

export const IconDropInto = (p: IconProps) => (
  <Stroke {...p} width={2}>
    <path d="M12 4v12M6 10l6 6 6-6M5 20h14" />
  </Stroke>
);

export const IconChevronLeft = (p: IconProps) => (
  <Stroke {...p}>
    <path d="m15 6-6 6 6 6" />
  </Stroke>
);

export const IconChevronDown = (p: IconProps) => (
  <Stroke {...p}>
    <path d="m6 9 6 6 6-6" />
  </Stroke>
);

export const IconRefresh = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </Stroke>
);

export const IconX = (p: IconProps) => (
  <Stroke {...p} width={1.9}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Stroke>
);

export const IconCheck = (p: IconProps) => (
  <Stroke {...p} width={2.2}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Stroke>
);

export const IconAlert = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 3.5 2.5 20h19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Stroke>
);

export const IconExclaim = (p: IconProps) => (
  <Stroke {...p} width={2.4}>
    <path d="M12 7v6M12 17v.01" />
  </Stroke>
);

export const IconTransfer = (p: IconProps) => (
  <Stroke {...p} width={1.6}>
    <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" />
  </Stroke>
);

export const IconBolt = ({ size = 14, label, outline }: IconProps & { outline?: boolean }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={outline ? "none" : "currentColor"}
    stroke={outline ? "currentColor" : "none"}
    strokeWidth={1.8}
    strokeLinejoin="round"
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </svg>
);

export function IconFolder({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"
        fill="currentColor"
      />
    </svg>
  );
}

export function FileKindIcon({ kind }: { kind: FileKind }) {
  switch (kind) {
    case "folder":
      return <IconFolder />;
    case "image":
      return (
        <Stroke size={18} width={1.6}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <circle cx="9" cy="9.5" r="1.6" />
          <path d="m20.5 16-5-5-8.5 8.5" />
        </Stroke>
      );
    case "video":
      return (
        <Stroke size={18} width={1.6}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
          <path d="m10 9.5 4.5 2.5-4.5 2.5z" />
        </Stroke>
      );
    case "audio":
      return (
        <Stroke size={18} width={1.6}>
          <path d="M9 18V6l10-2v12" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="16.5" cy="16" r="2.5" />
        </Stroke>
      );
    case "doc":
      return (
        <Stroke size={18} width={1.6}>
          <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
          <path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" />
        </Stroke>
      );
    default:
      return (
        <Stroke size={18} width={1.6}>
          <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
          <path d="M14 3.5V8h4.5" />
        </Stroke>
      );
  }
}

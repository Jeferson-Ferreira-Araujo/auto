import type { SVGProps } from "react";

/** Ícones em traço (estilo Lucide), 24x24, currentColor. */
const P = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    width={20}
    height={20}
    {...props}
  />
);

export const Icon = {
  home: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </P>
  ),
  calendar: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
    </P>
  ),
  posts: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </P>
  ),
  media: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4 19 5-4 4 3 3-2 4 3" />
    </P>
  ),
  tag: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M3.5 12 12 3.5h8.5V12L12 20.5Z" />
      <circle cx="16" cy="8" r="1.4" />
    </P>
  ),
  automation: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z" />
    </P>
  ),
  instagram: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </P>
  ),
  shield: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="m9.5 12 2 2 3.5-4" />
    </P>
  ),
  chart: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M4 20V4M4 20h16" />
      <rect x="8" y="12" width="3" height="5" />
      <rect x="14" y="8" width="3" height="9" />
    </P>
  ),
  settings: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </P>
  ),
  bell: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </P>
  ),
  plus: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M12 5v14M5 12h14" />
    </P>
  ),
  chevronDown: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="m6 9 6 6 6-6" />
    </P>
  ),
  chevronLeft: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="m15 18-6-6 6-6" />
    </P>
  ),
  arrowUpRight: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M7 17 17 7M8 7h9v9" />
    </P>
  ),
  eye: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </P>
  ),
  heart: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M12 20s-7-4.4-9.5-8.5C1 8.5 2.5 5 6 5c2 0 3.3 1.2 4 2.3C10.7 6.2 12 5 14 5c3.5 0 5 3.5 3.5 6.5C19 15.6 12 20 12 20Z" />
    </P>
  ),
  comment: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12Z" />
    </P>
  ),
  userPlus: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M18 8v6M15 11h6" />
    </P>
  ),
  rocket: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
      <path d="M14 5c3-3 7-2 7-2s1 4-2 7l-6 6-5-5Z" />
      <circle cx="14.5" cy="9.5" r="1.5" />
    </P>
  ),
  sparkle: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <path d="m6 6 3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
    </P>
  ),
  box: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </P>
  ),
  clock: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </P>
  ),
  alert: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v5M12 18h.01" />
    </P>
  ),
  check: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="m5 13 4 4 10-11" />
    </P>
  ),
  barcode: (p: SVGProps<SVGSVGElement>) => (
    <P {...p}>
      <path d="M4 5v14M8 5v14M12 5v14M16 5v14M20 5v14" />
    </P>
  ),
};

export type IconName = keyof typeof Icon;

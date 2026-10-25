/* Line icons for the dashboards (menu, overview cards). Plain SVG, no client code. */
export type IconName =
  'grid' | 'bag' | 'chat' | 'shield' | 'plus' | 'home' | 'user' | 'scale' | 'wallet' | 'flag' | 'lock' | 'gear' | 'search' | 'check' | 'pulse' | 'layers' | 'branch' | 'list' | 'tool' | 'chart';

const ICON: Record<IconName, React.ReactNode> = {
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  bag: <path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  home: <path d="M4 11l8-7 8 7v9H4z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  scale: <path d="M12 4v16M7 20h10M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z" />,
  wallet: <path d="M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1zM4 7l12-3v3M16 13h1" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  pulse: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  layers: <path d="M12 4l9 5-9 5-9-5zM3 14l9 5 9-5" />,
  branch: (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 7v10M18 10c0 4-6 3-11 7" />
    </>
  ),
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  tool: <path d="M15 4a4 4 0 0 0-1 5l-9 9 2 2 9-9a4 4 0 0 0 5-1l-2-2-2 1-1-1 1-2z" />,
};
export const DashIcon = ({ n }: { n: IconName }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICON[n]}
  </svg>
);

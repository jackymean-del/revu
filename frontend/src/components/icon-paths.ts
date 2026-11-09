/** The paths of the icons Icon draws: 24 by 24, stroked. */
export const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5',
  resources: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  configuration: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  create: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6',
  assign: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  evaluate: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  scheme: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5',
  reexam: 'M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  history: 'M12 7v5l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v5h5',
  groups: 'M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h.01M15 11h.01',
  owner: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z',
  guide: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M15.5 8.5l-2 5-5 2 2-5z',
  status: 'M3 12h4l3-8 4 16 3-8h4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
} as const

export type IconName = keyof typeof PATHS

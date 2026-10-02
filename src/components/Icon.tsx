import type { SVGProps } from 'react'

const paths = {
  loaf: (
    <>
      <path d="M4 15c0-5 3.6-9 8-9s8 4 8 9v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2Z" />
      <path d="M8.5 10.5c.8 1 1.2 2.2 1.2 3.5M12 9.5c.8 1.2 1.2 2.6 1.2 4.2M15.5 10.5c.6.9.9 2 .9 3.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Z" />
      <path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H18M9 8.5h5" />
    </>
  ),
  chart: (
    <>
      <path d="M4.5 19.5h15M4.5 19.5v-15" />
      <circle cx="9" cy="14" r="1.6" />
      <circle cx="13" cy="10.5" r="1.6" />
      <circle cx="17" cy="7.5" r="1.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  download: <path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  camera: (
    <>
      <path d="M4.5 8.5A1.5 1.5 0 0 1 6 7h2l1.5-2h5L16 7h2a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  star: (
    <path
      d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.8Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  snow: <path d="M12 3.5v17M4.6 7.75l14.8 8.5M4.6 16.25l14.8-8.5M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />,
  flame: <path d="M12 20.5c3.6 0 6-2.4 6-5.8 0-4.2-3.6-6-4.6-10.2C11 7 9.6 8.2 9.2 10.5 8 9.8 7.6 8.7 7.5 7.8 6.4 9.4 6 11.2 6 14.7c0 3.4 2.4 5.8 6 5.8Z" />,
  thermo: (
    <>
      <path d="M10 13.6V5.5a2 2 0 1 1 4 0v8.1a4 4 0 1 1-4 0Z" />
      <path d="M12 9v7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 20.5 19h-17L12 4.5Z" />
      <path d="M12 10v4M12 16.5v.01" />
    </>
  ),
  logout: <path d="M14 5H6.5v14H14M10 12h10M16.5 8.5 20 12l-3.5 3.5" />,
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" />,
  back: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  jar: (
    <>
      <path d="M8 4.5h8M8.5 4.5v2.5L7 9v9.5A1.5 1.5 0 0 0 8.5 20h7a1.5 1.5 0 0 0 1.5-1.5V9l-1.5-2V4.5" />
      <path d="M7 13c1.5-1 3.5 1 5 0s3.5 1 5 0" />
    </>
  ),
  scale: (
    <>
      <path d="M5 19.5h14l-1.5-8h-11L5 19.5Z" />
      <path d="M9 11.5a3 3 0 0 1 6 0M12 5v3.5" />
    </>
  ),
} as const

export type IconName = keyof typeof paths

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  )
}

/** The app mark: a round boule with a single curved score. */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <ellipse cx="32" cy="40" rx="27" ry="17" fill="#6e3414" />
      <path d="M5 38c0-13 12-26 27-26s27 13 27 26c0 6-12 9-27 9S5 44 5 38Z" fill="#b8642f" />
      <path d="M8 36c1-11 11-21 24-21" fill="none" stroke="#d98b4b" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      <path d="M18 22c8 4 18 14 22 22" fill="none" stroke="#f3d39a" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M20 23.5c7 4 15.5 12.5 19 19" fill="none" stroke="#fff3dc" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="44" cy="22" r="1.3" fill="#f6e3b8" opacity=".8" />
      <circle cx="49" cy="28" r="1" fill="#f6e3b8" opacity=".7" />
      <circle cx="40" cy="18" r=".9" fill="#f6e3b8" opacity=".7" />
    </svg>
  )
}

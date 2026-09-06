/**
 * Official-style "Download on the App Store" / "Get it on Google Play" badges.
 *
 * Self-contained inline SVG — no external image hosts, so these keep working
 * on the unauthenticated login screen without any CDN or asset dependency.
 */

const APP_STORE_URL = "https://apps.apple.com/sg/app/tertiary-hrms/id6759821144";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.tertiaryinfotech.hrportal";

/** Dark badge on a light surface — the treatment Apple and Google specify for white backgrounds. */
const badgeClass =
  "inline-flex items-center gap-3 rounded-xl bg-black px-4 py-2.5 text-white transition hover:bg-gray-800";

export function AppStoreBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download on the App Store"
      className={`${badgeClass} ${className}`}
    >
      <svg viewBox="0 0 384 512" className="h-7 w-7 shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C71.5 141.1 0 184.6 0 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM255.6 88.3c30.4-36.1 27.6-68.9 26.7-80.7-26.8 1.6-57.8 18.3-75.5 38.9-19.5 22.1-31 49.4-28.5 79.9 28.9 2.2 55.3-12.7 77.3-38.1z" />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-gray-300">
          Download on the
        </span>
        <span className="whitespace-nowrap text-lg font-semibold tracking-tight">App Store</span>
      </span>
    </a>
  );
}

export function GooglePlayBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Get it on Google Play"
      className={`${badgeClass} ${className}`}
    >
      <svg viewBox="0 0 512 512" className="h-7 w-7 shrink-0" aria-hidden="true">
        <path fill="#00D9FF" d="M47.6 24.6C41.2 31.3 37.5 41.7 37.5 55.2v401.6c0 13.5 3.7 23.9 10.1 30.6l1.3 1.3 225-225v-5.3l-225-225-1.3 1.2z" />
        <path fill="#FFD400" d="M348.2 336.9l-75-75v-5.3l75.1-75.1 1.7 1 88.9 50.5c25.4 14.4 25.4 38 0 52.5l-88.9 50.5-1.8.9z" />
        <path fill="#FF3A44" d="M349.9 335.9l-76.7-76.7L47.6 484.8c8.4 8.9 22.2 10 37.8 1.1l264.5-150z" />
        <path fill="#00C244" d="M349.9 176.1L85.4 26.1C69.8 17.2 56 18.3 47.6 27.2l225.6 225.6 76.7-76.7z" />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-gray-300">
          Get it on
        </span>
        <span className="whitespace-nowrap text-lg font-semibold tracking-tight">Google Play</span>
      </span>
    </a>
  );
}

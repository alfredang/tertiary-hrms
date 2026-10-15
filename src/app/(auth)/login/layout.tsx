import type { Metadata } from "next";

// Sign-in screen: keep it out of Google's index ("/" redirects here, so it was
// reported as "Duplicate without user-selected canonical").
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

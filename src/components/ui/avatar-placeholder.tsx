import type { Gender } from "@prisma/client";

export function AvatarPlaceholder({
  gender,
  className,
}: {
  gender?: Gender | null;
  className?: string;
}) {
  const isFemale = gender === "FEMALE";
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className ?? "w-full h-full"}
      aria-hidden="true"
    >
      <rect width="64" height="64" fill="#3b3a52" />
      {isFemale ? (
        <g fill="#f3c89c">
          {/* hair back */}
          <path d="M16 30c0-9 7-16 16-16s16 7 16 16v6c0 1-1 2-2 2H18c-1 0-2-1-2-2v-6z" fill="#3a2a22" />
          {/* face */}
          <circle cx="32" cy="28" r="11" />
          {/* hair fringe */}
          <path d="M21 24c2-5 6-9 11-9s9 4 11 9c-3-1-7-2-11-2s-8 1-11 2z" fill="#3a2a22" />
          {/* neck */}
          <path d="M28 36h8v6h-8z" />
          {/* shoulders / shirt */}
          <path d="M14 64c2-9 9-14 18-14s16 5 18 14H14z" fill="#d36ba0" />
        </g>
      ) : (
        <g fill="#e5b591">
          {/* hair */}
          <path d="M18 26c0-8 6-14 14-14s14 6 14 14v3H18z" fill="#2e2317" />
          {/* face */}
          <circle cx="32" cy="29" r="10" />
          {/* neck */}
          <path d="M28 37h8v6h-8z" />
          {/* shoulders / shirt */}
          <path d="M14 64c2-9 9-14 18-14s16 5 18 14H14z" fill="#4a6fa5" />
        </g>
      )}
    </svg>
  );
}

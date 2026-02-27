"use client";

export function UsdcLogo({ size = 20 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="32" r="30" fill="#2775CA" />
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3"
        opacity="0.9"
      />
      <path
        d="M38.5 20.5c-2-2.2-5-3.5-8.5-3.5-5.5 0-10 3-10 7.2 0 4.6 4.2 6.1 9.5 7.3 5.7 1.3 8.5 2.3 8.5 4.7 0 2.2-2.5 3.8-6.3 3.8-3.3 0-6.2-1.2-8.3-3.4"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M26 14v36"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M38 14v36"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}


"use client";

import { clamp } from "../../lib/baso/utils";

export interface BasoMascotSVGProps {
  eatTick: number;
  donutProgress: number;
  frostColor: string;
}

export function BasoMascotSVG({
  eatTick,
  donutProgress,
  frostColor,
}: BasoMascotSVGProps): React.ReactElement {
  const p = clamp(donutProgress, 0, 1);
  const eatClass = eatTick % 2 === 0 ? "eat0" : "eat1";

  const maskId = `donutMask_${Math.random().toString(16).slice(2)}`;
  const totalBites = 8;
  const biteCount = clamp(Math.floor(p * totalBites + 1e-6), 0, totalBites);
  const donutVisible = biteCount >= totalBites ? 0 : 1;

  const biteCircleR = 30;
  const biteCircleDist = 44;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const biteCenter = (centerDeg: number) => {
    const a = toRad(centerDeg);
    return { x: biteCircleDist * Math.cos(a), y: biteCircleDist * Math.sin(a) };
  };

  const highlightStroke = frostColor.toLowerCase() === "#ffffff" ? "rgba(7,17,41,.20)" : "#FFFFFF";

  return (
    <svg width="300" height="280" viewBox="0 0 300 280" style={{ userSelect: "none" }}>
      <g className={`eatRoot ${eatClass}`}>
        <g className="basoBody">
          <circle cx="124" cy="156" r="94" fill="#1E63FF" />
          <path d="M70 78c20 0 34 14 38 32-20-4-34-10-38-32Z" fill="#0B3DCC" opacity="0.96" />
          <path d="M178 78c-20 0-34 14-38 32 20-4 34-10 38-32Z" fill="#0B3DCC" opacity="0.96" />
          <circle cx="80" cy="176" r="18" fill="#0B3DCC" opacity="0.32" />
          <circle cx="168" cy="176" r="18" fill="#0B3DCC" opacity="0.32" />
          <circle cx="104" cy="146" r="12" fill="#071129" />
          <circle cx="148" cy="146" r="12" fill="#071129" />

          <path
            className="mouthSmile"
            d="M110 176c10 10 26 10 36 0"
            fill="none"
            stroke="#071129"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            className="mouthOpen"
            d="M112 172c6 18 26 26 36 0c-12 4-24 4-36 0Z"
            fill="#071129"
            opacity="0"
          />
        </g>

        <g className="donutGroup">
          <rect x="186" y="182" width="40" height="18" rx="9" fill="#0B3DCC" opacity="0.55" />

          <g transform="translate(222 178)">
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x="-96" y="-96" width="192" height="192">
                <rect x="-96" y="-96" width="192" height="192" fill="#fff" />
                {Array.from({ length: biteCount }, (_, i) => {
                  const center = 180 + i * (360 / totalBites);
                  const c = biteCenter(center);
                  return <circle key={i} cx={c.x} cy={c.y} r={biteCircleR} fill="#000" />;
                })}
              </mask>
              <clipPath id={`${maskId}_ring`}>
                <path
                  d="M0,-38 A38,38 0 1,1 0,38 A38,38 0 1,1 0,-38 M0,-18 A18,18 0 1,0 0,18 A18,18 0 1,0 0,-18Z"
                  clipRule="evenodd"
                />
              </clipPath>
            </defs>

            <g
              clipPath={`url(#${maskId}_ring)`}
              mask={`url(#${maskId})`}
              style={{ opacity: donutVisible }}
            >
              <path
                d="M0,-38 A38,38 0 1,1 0,38 A38,38 0 1,1 0,-38 M0,-15 A15,15 0 1,0 0,15 A15,15 0 1,0 0,-15Z"
                fill="#F2B46D"
                fillRule="evenodd"
              />
              <path
                d="M0,-38 A38,38 0 1,1 0,38 A38,38 0 1,1 0,-38 M0,-15 A15,15 0 1,0 0,15 A15,15 0 1,0 0,-15Z"
                fill="#E69B4B"
                fillRule="evenodd"
                opacity="0.22"
                transform="translate(0,3)"
              />
              <path
                d="M0,-34 A34,34 0 1,1 0,34 A34,34 0 1,1 0,-34 M0,-18 A18,18 0 1,0 0,18 A18,18 0 1,0 0,-18Z"
                fill={frostColor}
                fillRule="evenodd"
                opacity="0.98"
              />
              <g opacity="0.95">
                <rect x="-18" y="-18" width="12" height="3.5" rx="1.75" fill="#7C3AED" transform="rotate(-18)" />
                <rect x="8" y="-20" width="12" height="3.5" rx="1.75" fill="#22C55E" transform="rotate(22)" />
                <rect x="-24" y="-2" width="12" height="3.5" rx="1.75" fill="#F59E0B" transform="rotate(10)" />
                <rect x="14" y="-2" width="12" height="3.5" rx="1.75" fill="#EF4444" transform="rotate(-14)" />
                <rect x="-14" y="14" width="12" height="3.5" rx="1.75" fill="#06B6D4" transform="rotate(-8)" />
                <rect x="6" y="14" width="12" height="3.5" rx="1.75" fill="#A855F7" transform="rotate(16)" />
              </g>
              <path
                d="M-18,-22 C-10,-30 6,-30 14,-22"
                stroke={highlightStroke}
                strokeWidth="4"
                strokeLinecap="round"
                opacity="0.55"
                fill="none"
              />
            </g>
          </g>
        </g>

        <g className="crumbs" opacity="0">
          <circle cx="154" cy="186" r="3" fill="#F2B46D" />
          <circle cx="162" cy="190" r="2.5" fill={frostColor} opacity="0.95" />
          <circle cx="146" cy="192" r="2" fill="#F2B46D" />
        </g>
      </g>
    </svg>
  );
}


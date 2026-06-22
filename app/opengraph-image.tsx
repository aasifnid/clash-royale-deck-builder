import { ImageResponse } from "next/og";

// Link-share thumbnail. Branded to the app's Clash Royale arena look: deep-blue
// gradient, gold crown motif, title + tagline. Self-contained (no remote assets).
export const alt = "Clash Royale Deck Builder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Gold crown (the Clash Royale motif), drawn as an inline SVG data URI.
const crown = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe28a"/>
        <stop offset="1" stop-color="#f3a712"/>
      </linearGradient>
    </defs>
    <path d="M8 80 L18 28 L42 52 L60 14 L78 52 L102 28 L112 80 Z"
      fill="url(#g)" stroke="#b9740a" stroke-width="4" stroke-linejoin="round"/>
    <rect x="8" y="80" width="104" height="12" rx="4" fill="#f3a712" stroke="#b9740a" stroke-width="4"/>
    <circle cx="60" cy="34" r="7" fill="#ff5a76" stroke="#b9740a" stroke-width="3"/>
    <circle cx="20" cy="44" r="6" fill="#3fd5e0" stroke="#b9740a" stroke-width="3"/>
    <circle cx="100" cy="44" r="6" fill="#3fd5e0" stroke="#b9740a" stroke-width="3"/>
  </svg>`,
)}`;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(1100px 520px at 50% -8%, #2c4a91 0%, transparent 62%), linear-gradient(180deg, #16285a 0%, #0c1736 100%)",
          color: "#eef4ff",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={crown} width={220} height={176} alt="" />
        <div
          style={{
            marginTop: 28,
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: -1,
            textShadow: "0 4px 0 rgba(0,0,0,0.35)",
          }}
        >
          Clash Royale Deck Builder
        </div>
        <div style={{ marginTop: 16, fontSize: 34, color: "#9db0e0" }}>
          Proven decks built from the cards you actually own.
        </div>
      </div>
    ),
    { ...size },
  );
}

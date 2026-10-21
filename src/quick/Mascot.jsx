// JOI's mascot: a little clay-coloured character with an antenna that ends in the glowing
// dot from the logo. Pure SVG + CSS animation (quick.css), so it's crisp and instant.
//
// mood: "idle" (bobs, blinks) | "listening" (perks up, antenna pulses) |
//       "thinking" (looks up, thought dots) | "talking" (mouth moves) | "happy" (big smile, hop)

export default function Mascot({ mood = "idle", size = 124 }) {
  return (
    <div className={`mascot mascot-${mood}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 140 140" width={size} height={size}>
        <defs>
          <linearGradient id="m-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f0a07c" />
            <stop offset="0.55" stopColor="#d97757" />
            <stop offset="1" stopColor="#bb5534" />
          </linearGradient>
          {/* warm glow so the antenna dot reads on the cream background too */}
          <radialGradient id="m-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#f4a679" stopOpacity="0.9" />
            <stop offset="1" stopColor="#f4a679" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="m-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <ellipse className="m-shadow" cx="70" cy="128" rx="34" ry="6" fill="#17150f" opacity="0.12" />

        <g className="m-figure">
          {/* antenna: a little stalk ending in the logo's glowing dot */}
          <g className="m-antenna">
            <path d="M74 34 C76 24 82 18 88 14" stroke="#c45f3d" strokeWidth="4" strokeLinecap="round" fill="none" />
            <circle className="m-antenna-glow" cx="90" cy="12" r="13" fill="url(#m-glow)" />
            <circle className="m-antenna-dot" cx="90" cy="12" r="6.5" fill="#fff6ec" stroke="#d97757" strokeWidth="2.5" />
          </g>

          {/* little feet */}
          <ellipse cx="54" cy="118" rx="10" ry="6" fill="#bb5534" />
          <ellipse cx="86" cy="118" rx="10" ry="6" fill="#bb5534" />

          {/* arms */}
          <g className="m-arm m-arm-left">
            <ellipse cx="24" cy="80" rx="8" ry="13" fill="#c9603f" transform="rotate(20 24 80)" />
          </g>
          <g className="m-arm m-arm-right">
            <ellipse cx="116" cy="80" rx="8" ry="13" fill="#c9603f" transform="rotate(-20 116 80)" />
          </g>

          {/* body */}
          <rect x="26" y="32" width="88" height="88" rx="38" fill="url(#m-body)" />
          <rect x="26" y="32" width="88" height="88" rx="38" fill="url(#m-sheen)" />

          {/* face plate */}
          <ellipse cx="70" cy="76" rx="32" ry="27" fill="#fdf1e6" />

          {/* eyes */}
          <g className="m-eyes">
            <g className="m-eye">
              <ellipse cx="58" cy="72" rx="7" ry="8.5" fill="#17150f" />
              <circle className="m-pupil-shine" cx="60.5" cy="69" r="2.4" fill="#fff" />
            </g>
            <g className="m-eye">
              <ellipse cx="82" cy="72" rx="7" ry="8.5" fill="#17150f" />
              <circle className="m-pupil-shine" cx="84.5" cy="69" r="2.4" fill="#fff" />
            </g>
          </g>

          {/* cheeks */}
          <ellipse cx="47" cy="84" rx="6" ry="3.6" fill="#f08a70" opacity="0.55" />
          <ellipse cx="93" cy="84" rx="6" ry="3.6" fill="#f08a70" opacity="0.55" />

          {/* mouths: one per mood, CSS shows the right one */}
          <path className="m-mouth m-mouth-smile" d="M62 87 Q70 94 78 87" stroke="#17150f" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path className="m-mouth m-mouth-happy" d="M60 85 Q70 99 80 85 Z" fill="#17150f" />
          <ellipse className="m-mouth m-mouth-talk" cx="70" cy="89" rx="6" ry="4.5" fill="#17150f" />
          <ellipse className="m-mouth m-mouth-o" cx="72" cy="89" rx="3.4" ry="3.6" fill="#17150f" />
        </g>

        {/* thought dots (thinking) */}
        <g className="m-thoughts">
          <circle cx="112" cy="38" r="3.5" fill="#d97757" />
          <circle cx="122" cy="28" r="4.5" fill="#d97757" />
          <circle cx="132" cy="16" r="5.5" fill="#d97757" />
        </g>

        {/* sound waves (listening) */}
        <g className="m-waves" stroke="#d97757" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M10 64 Q4 76 10 88" />
          <path d="M2 58 Q-6 76 2 94" />
        </g>
      </svg>
    </div>
  );
}

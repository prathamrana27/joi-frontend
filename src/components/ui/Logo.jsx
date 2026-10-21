import { LOGO_ICON, LOGO_LIGHT } from "../../assets/logos.js";

// Brand lockup: the "j" mark plus the JOI wordmark set in Fraunces.
export default function Logo({ size = 32, light = false, wordmark = true, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={light ? LOGO_LIGHT : LOGO_ICON}
        alt="JOI"
        style={{ width: size, height: size }}
        className="shrink-0 drop-shadow-sm"
      />
      {wordmark && (
        <span
          className="font-display font-semibold tracking-tight"
          style={{ fontSize: Math.round(size * 0.72), color: light ? "#ffffff" : "#17150f" }}
        >
          JOI
        </span>
      )}
    </span>
  );
}

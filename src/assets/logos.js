// Imported (not /public paths) so Vite emits relative URLs that work under file:// in Electron.
// Source of truth for the brand mark; raster icons are generated from logo-mark.svg (npm run icons).
import mark from "./logo-mark.svg";
import markLight from "./logo-mark-light.svg";

export const LOGO_ICON = mark;        // clay tile, cream "j" — default
export const LOGO_LIGHT = markLight;  // cream tile, clay "j" — for use on clay backgrounds

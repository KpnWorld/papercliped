// Built into /theme-boot.js and loaded (not inlined, so the CSP needs no 'unsafe-inline') before the stylesheet, so the
// right palette is on <html> before the first paint. Light or dark comes from the device through CSS alone.
import { applyPrefs, readPrefs } from "./prefs";

applyPrefs(readPrefs().theme);

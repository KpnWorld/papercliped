// Built into /theme-boot.js and loaded (not inlined, so the CSP needs no 'unsafe-inline') before the stylesheet, so the
// right theme is on <html> before the first paint.
import { applyPrefs, readPrefs } from "./prefs";

const p = readPrefs();
applyPrefs(p.theme, p.mode);

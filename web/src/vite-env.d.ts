/// <reference types="vite/client" />
declare module "virtual:themes.css";
interface ImportMetaEnv {
  readonly VITE_DISCORD_URL?: string;
  readonly VITE_X_URL?: string;
  readonly VITE_DISCUSSIONS_URL?: string;
  readonly VITE_FORUM_URL?: string;
}

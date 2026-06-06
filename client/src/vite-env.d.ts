/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute URL of the realtime backend (Render). Unset → same-origin (local dev). */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

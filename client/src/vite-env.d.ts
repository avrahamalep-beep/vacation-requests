/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** If set, shown as the public URL in dev. Example: https://my-app.onrender.com */
  readonly VITE_PUBLIC_APP_URL?: string;
}

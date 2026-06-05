import type { ApiSurface } from '../preload/index.js';

declare global {
  interface Window {
    api: ApiSurface;
  }
}

export {};

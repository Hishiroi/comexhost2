import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * SSR-safe wrapper around sessionStorage. During Angular Universal /
 * server-side rendering there is no `window`, so any direct access to
 * `sessionStorage` would crash the build/render. All other services
 * and guards use this wrapper.
 *
 * Why sessionStorage (not localStorage):
 *   sessionStorage is scoped per-tab, so signing in as Principal in
 *   one tab and as Teacher in another tab keeps the two sessions
 *   independent. localStorage is shared across all tabs of the same
 *   origin, which caused the most recent login to silently hijack
 *   every other open tab on refresh.
 *
 * Caveat: opening a new tab with Ctrl/Cmd-click or via window.open
 * from an existing tab will *clone* sessionStorage into the new tab.
 * That clone is independent from then on (writes don't propagate),
 * which is exactly what we want for multi-role testing.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private store(): Storage | null {
    if (!this.isBrowser) return null;
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  get(key: string): string | null {
    const s = this.store();
    if (!s) return null;
    try {
      return s.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    const s = this.store();
    if (!s) return;
    try {
      s.setItem(key, value);
    } catch {
      /* quota / private mode - ignore */
    }
  }

  remove(key: string): void {
    const s = this.store();
    if (!s) return;
    try {
      s.removeItem(key);
    } catch {
      /* noop */
    }
  }
}

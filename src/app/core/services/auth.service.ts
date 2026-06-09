import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthUser, LoginResponse, RoleLevel, RoleName } from '../models/auth.models';
import { StorageService } from './storage.service';

const TOKEN_KEY = 'comex.token';
const USER_KEY = 'comex.user';

/**
 * Single source of truth for the logged-in user on the frontend.
 *
 * Important security notes:
 *
 *   - The frontend NEVER decides authorization on its own. Guards and
 *     UI bindings only use this state to decide *what to show*; every
 *     privileged action goes back through HttpClient -> backend, which
 *     re-validates the JWT and the user's role/token_version on every
 *     request. So even if a user tampers with localStorage, they
 *     cannot reach data their role doesn't allow.
 *   - On boot we call refresh() to re-validate the stored token. If
 *     the backend returns 401 (token expired or revoked via logout),
 *     we silently clear the local session so the user is sent to the
 *     login page on their next interaction.
 *   - logout() calls the backend first so the JWT is invalidated
 *     server-side (token_version bump), then clears local state.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);

  private readonly _user = signal<AuthUser | null>(this.readUser());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly role = computed<RoleName | null>(() => this._user()?.role ?? null);
  /**
   * Always numeric (1–4). Some API/storage paths may deserialize role_level
   * as a string; strict equality in guards / file-review would otherwise hide
   * actions (Forward, etc.) for all reviewer roles.
   */
  readonly roleLevel = computed<RoleLevel | null>(() => {
    const raw = this._user()?.role_level;
    if (raw == null) return null;
    const n = Number(raw);
    return n >= 1 && n <= 4 ? (n as RoleLevel) : null;
  });

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((res) => this.persistSession(res.token, res.user)));
  }

  /**
   * Re-validate the stored JWT against the backend. Used at app boot
   * (so a page refresh keeps the user logged in) and as a "is my token
   * still good?" probe. Returns true if the session is still valid.
   *
   * Failure modes are swallowed here on purpose - the global error
   * interceptor will handle 401 by triggering clearLocal() + redirect.
   */
  refresh(): Observable<boolean> {
    if (!this.getToken()) return of(false);
    return this.http.get<{ user: AuthUser }>(`${environment.apiUrl}/auth/me`).pipe(
      tap((res) => this.persistUser(res.user)),
      map(() => true),
      catchError(() => {
        this.clearLocal();
        return of(false);
      })
    );
  }

  /**
   * Bootstrap hook: called once at app startup. Resolves regardless of
   * the network outcome so it never blocks the UI from rendering.
   */
  bootstrap(): Promise<void> {
    return new Promise((resolve) => {
      this.refresh()
        .pipe(finalize(() => resolve()))
        .subscribe({ error: () => resolve() });
    });
  }

  /**
   * Explicit user-initiated logout. Tells the backend to bump
   * token_version (server-side revocation), then clears local state.
   * Always resolves successfully so the UI can redirect to /login
   * even if the backend is unreachable.
   */
  logout(): Observable<void> {
    const hasSession = this._user() !== null && this.getToken() !== null;
    if (!hasSession) {
      this.clearLocal();
      return of(void 0);
    }
    return this.http
      .post<{ ok: boolean }>(`${environment.apiUrl}/auth/logout`, {})
      .pipe(
        catchError(() => of({ ok: false })),
        tap(() => this.clearLocal()),
        map(() => void 0)
      );
  }

  /**
   * Synchronous local-only clear. Used by the error interceptor when
   * the backend reports the session is no longer valid (avoids the
   * recursive HTTP call that the full logout() would trigger).
   */
  clearLocal(): void {
    this._user.set(null);
    this.storage.remove(TOKEN_KEY);
    this.storage.remove(USER_KEY);
  }

  getToken(): string | null {
    return this.storage.get(TOKEN_KEY);
  }

  defaultRoute(): string {
    const u = this._user();
    if (!u) return '/login';
    return AuthService.routeFor(u.role_level);
  }

  static routeFor(level: RoleLevel): string {
    switch (level) {
      case 1: return '/teacher/home';
      case 2: return '/coard/dashboard';
      case 3: return '/master/dashboard';
      case 4: return '/admin/dashboard';
      default: return '/login';
    }
  }

  private persistSession(token: string, user: AuthUser): void {
    this.storage.set(TOKEN_KEY, token);
    this.persistUser(user);
  }

  /**
   * Update the cached session user (e.g. after the Principal edits their own
   * name/email in Account Management) without issuing a full /auth/me round-trip.
   */
  mergeStoredUser(partial: Partial<AuthUser>): void {
    const cur = this._user();
    if (!cur) return;
    const next: AuthUser = { ...cur, ...partial };
    this.persistUser(next);
  }

  private persistUser(user: AuthUser): void {
    this.storage.set(USER_KEY, JSON.stringify(user));
    this._user.set(user);
  }

  private readUser(): AuthUser | null {
    const raw = this.storage.get(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}

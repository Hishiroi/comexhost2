import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { RoleLevel } from '../models/auth.models';

/**
 * Returns a guard that only allows users whose role_level is in `allowed`.
 *
 * IMPORTANT: this is a UX shortcut, not a security boundary. The
 * backend re-checks the role on every API call (see middleware/role.js),
 * so a user that bypasses this guard in dev tools STILL cannot read or
 * mutate data that's outside their role.
 */
export function roleGuard(...allowed: RoleLevel[]): CanActivateFn {
  return (): boolean | UrlTree => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isLoggedIn()) {
      return router.createUrlTree(['/login']);
    }
    const level = auth.roleLevel();
    if (level && allowed.includes(level)) return true;

    // Logged in, but with a different role -> send them home.
    return router.parseUrl(auth.defaultRoute());
  };
}

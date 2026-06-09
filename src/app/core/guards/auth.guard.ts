import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Blocks any route from rendering when the user is not logged in. The
 * very first thing a visitor sees on this app is the login page, and
 * every other route in the app is wrapped with this guard. The actual
 * authorization check lives on the backend - this guard only avoids
 * showing UI we know will fail.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

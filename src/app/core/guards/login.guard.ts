import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * If the user is already logged in, sending them to /login is just an
 * annoyance; route them straight to their dashboard instead.
 */
export const loginGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return true;
  return router.parseUrl(auth.defaultRoute());
};

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/**
 * Centralized HTTP error handling:
 *
 *   - 401 (token missing / expired / revoked / user deactivated):
 *     clear the local session SYNCHRONOUSLY (clearLocal, not logout)
 *     and redirect to /login. We use clearLocal here on purpose -
 *     calling logout() would itself fire an HTTP request that could
 *     also receive a 401, looping us forever.
 *   - 403 (forbidden by role): bounce the user back to their own
 *     dashboard. The backend is the actual gate; this just keeps the
 *     UI consistent.
 *   - Network / 5xx: forward the error so the calling component can
 *     display a friendly message.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const isApi = req.url.startsWith(environment.apiUrl);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && isApi) {
        if (err.status === 401) {
          auth.clearLocal();
          if (!router.url.startsWith('/login')) {
            router.navigate(['/login'], {
              queryParams: { returnUrl: router.url },
            });
          }
        } else if (err.status === 403) {
          router.navigateByUrl(auth.defaultRoute());
        }
      }
      return throwError(() => err);
    })
  );
};

import {
  ApplicationConfig,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AuthService } from './core/services/auth.service';

/**
 * App-level providers.
 *
 *   - HttpClient is configured with both interceptors (auth header +
 *     401/403 handler) so EVERY HTTP call goes through them.
 *   - provideAppInitializer revalidates the stored JWT against the
 *     backend on app boot. If the token is expired or was revoked
 *     server-side via /api/auth/logout, the user state is silently
 *     cleared and the route guards send them to /login. If the token
 *     is still valid, the user stays logged in across page refreshes.
 *   - The initializer runs only in the browser; during SSR there is
 *     no localStorage/JWT, so we resolve immediately.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor, errorInterceptor]),
    ),
    provideClientHydration(withEventReplay()),
    provideAppInitializer(() => {
      const platformId = inject(PLATFORM_ID);
      if (!isPlatformBrowser(platformId)) return Promise.resolve();
      return inject(AuthService).bootstrap();
    }),
  ],
};

import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Auth-protected routes touch localStorage / make HTTP calls that
 * depend on a logged-in user. Server-side prerendering of those would
 * either crash or render a blank, useless shell. Render them client-
 * side instead. The login page is fine to prerender.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'login', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];

import { Routes } from '@angular/router';

import { Dashboard } from './admin/dashboard/dashboard';
import { Document } from './admin/document/document';
import { Files } from './admin/files/files';
import { Account } from './admin/account/account';
import { Login as SharedLogin } from './components/login/login';
import { Dashboard as CoardDashboard } from './coard/dashboard/dashboard';
import { Document as CoardDocument } from './coard/document/document';
import { Files as CoardFile } from './coard/file/file';
import { History as CoardHistory } from './coard/history/history';
import { Dashboard as MasterDashboard } from './Master/dashboard/dashboard';
import { Document as MasterDocument } from './Master/document/document';
import { Files as MasterFile } from './Master/file/file';
import { History as MasterHistory } from './Master/history/history';
import { Documents } from './teacher/documents/documents';
import { File } from './teacher/file/file';
import { Home } from './teacher/home/home';
import { Upload } from './teacher/upload/upload';
import { Profile } from './profile/profile';

import { authGuard } from './core/guards/auth.guard';
import { loginGuard } from './core/guards/login.guard';
import { roleGuard } from './core/guards/role.guard';

/**
 * Routing rules:
 *
 *  - The very first thing a visitor sees is /login. The empty path and
 *    every unknown path redirect there.
 *  - Every section (admin / teacher / coord / master) is wrapped with
 *    authGuard + roleGuard - the frontend never even renders those
 *    components for a wrong role / unauthenticated user.
 *  - Backend re-checks the JWT and the role on EVERY API call, so even
 *    if a user manipulates the URL or local storage, the server still
 *    refuses any out-of-role request.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  { path: 'login', component: SharedLogin, canActivate: [loginGuard] },

  {
    path: 'profile',
    component: Profile,
    canActivate: [authGuard, roleGuard(1, 2, 3)],
  },

  // Admin (Principal) - role 4
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard(4)],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: Dashboard },
      { path: 'files', component: Files },
      { path: 'file', redirectTo: 'files', pathMatch: 'full' },
      { path: 'document', component: Document },
      { path: 'account', component: Account },
    ],
  },

  // Coordinator - role 2
  {
    path: 'coard',
    canActivate: [authGuard, roleGuard(2)],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: CoardDashboard },
      { path: 'document', component: CoardDocument },
      { path: 'history', component: CoardHistory },
      { path: 'file', component: CoardFile },
    ],
  },

  // Master - role 3
  {
    path: 'master',
    canActivate: [authGuard, roleGuard(3)],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: MasterDashboard },
      { path: 'document', component: MasterDocument },
      { path: 'history', component: MasterHistory },
      { path: 'file', component: MasterFile },
    ],
  },

  // Teacher - role 1
  {
    path: 'teacher',
    canActivate: [authGuard, roleGuard(1)],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', component: Home },
      { path: 'documents', component: Documents },
      { path: 'file', component: File },
      { path: 'upload', component: Upload },
    ],
  },

  // Catch-all: anything unknown bounces back to /login.
  { path: '**', redirectTo: 'login' },
];

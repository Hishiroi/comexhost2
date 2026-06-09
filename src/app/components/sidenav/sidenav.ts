import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatDrawerMode } from '@angular/material/sidenav';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { Header } from '../header/header';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

type AppSection = 'admin' | 'teacher' | 'coard' | 'master';

const NAV_LINKS: Record<AppSection, NavItem[]> = {
  admin: [
    { label: 'Dashboard', icon: 'dashboard', route: '/admin/dashboard' },
    { label: 'Document', icon: 'description', route: '/admin/document' },
    { label: 'Account', icon: 'person_add', route: '/admin/account' },
  ],
  teacher: [
    { label: 'Home', icon: 'home', route: '/teacher/home' },
    { label: 'Profile', icon: 'person', route: '/profile' },
    { label: 'Documents', icon: 'description', route: '/teacher/documents' },
    { label: 'Upload', icon: 'upload_file', route: '/teacher/upload' },
  ],
  coard: [
    { label: 'Dashboard', icon: 'dashboard', route: '/coard/dashboard' },
    { label: 'Profile', icon: 'person', route: '/profile' },
    { label: 'Document', icon: 'description', route: '/coard/document' },
    { label: 'History', icon: 'history', route: '/coard/history' },
  ],
  master: [
    { label: 'Dashboard', icon: 'dashboard', route: '/master/dashboard' },
    { label: 'Profile', icon: 'person', route: '/profile' },
    { label: 'Document', icon: 'description', route: '/master/document' },
    { label: 'History', icon: 'history', route: '/master/history' },
  ],
};

@Component({
  selector: 'app-sidenav',
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    Header,
  ],
  templateUrl: './sidenav.html',
  styleUrl: './sidenav.css',
})
export class Sidenav implements OnInit, OnDestroy {
  private readonly mobileLikeBreakpoint = '(max-width: 1024px)';
  private readonly subscriptions = new Subscription();
  private isMobile = false;

  currentSection: AppSection = 'admin';
  shouldRun = false;

  /** Start collapsed; user opens via header menu (all breakpoints). */
  opened = false;
  drawerMode: MatDrawerMode = 'side';
  fixedInViewport = false;
  fixedTopGap = 0;
  fixedBottomGap = 0;

  @ViewChild('sidenav') sidenav!: MatSidenav;

  private readonly auth = inject(AuthService);

  constructor(
    public router: Router,
    private dialog: MatDialog,
    private breakpointObserver: BreakpointObserver,
  ) {
    const initialIsMobile =
      typeof window !== 'undefined' && window.matchMedia(this.mobileLikeBreakpoint).matches;

    if (initialIsMobile) {
      this.isMobile = true;
      this.drawerMode = 'over';
      this.opened = false;
      this.fixedTopGap = 56;
    }

    this.updateSectionFromUrl(this.router.url);
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.updateSectionFromUrl(event.urlAfterRedirects);

          if (this.isMobile && this.sidenav?.opened) {
            this.sidenav.close();
          }
        }),
    );

    this.subscriptions.add(
      this.breakpointObserver.observe([this.mobileLikeBreakpoint]).subscribe((result) => {
        this.isMobile = result.matches;

        if (this.isMobile) {
          this.drawerMode = 'over';
          this.opened = false;
          this.fixedTopGap = 56;
          return;
        }

        this.drawerMode = 'side';
        this.fixedTopGap = 64;
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get navLinks(): NavItem[] {
    return NAV_LINKS[this.currentSection];
  }

  get sectionLabel(): string {
    switch (this.currentSection) {
      case 'admin':
        return 'Principal';
      case 'teacher':
        return 'Teacher';
      case 'coard':
        return 'Coord';
      case 'master':
        return 'Master';
      default:
        return '';
    }
  }

  toggleSidenav(): void {
    this.sidenav?.toggle();
  }

  logout(): void {
    const dialogRef = this.dialog.open(LogoutConfirmationDialog, {
      width: '300px',
      panelClass: 'logout-dialog',
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      // Wait for the backend to invalidate the JWT (token_version bump)
      // before navigating, so this device cannot keep using the old token
      // even for an instant. logout() always resolves successfully.
      this.auth.logout().subscribe(() => {
        this.router.navigate(['/login']);
      });
    });
  }

  private updateSectionFromUrl(url: string): void {
    const path = url.split('?')[0].split('#')[0];
    const isProfileStandalone = path === '/profile';
    const isAdminSection = path.startsWith('/admin');
    const isTeacherSection = path.startsWith('/teacher');
    const isCoardSection = path.startsWith('/coard');
    const isMasterSection = path.startsWith('/master');
    const isLoginPage = path.endsWith('/login');

    if (isProfileStandalone && !isLoginPage) {
      const level = Number(this.auth.roleLevel() ?? 0);
      if (level === 1) this.currentSection = 'teacher';
      else if (level === 2) this.currentSection = 'coard';
      else if (level === 3) this.currentSection = 'master';
      this.shouldRun = level >= 1 && level <= 3;
      return;
    }

    if (isTeacherSection) {
      this.currentSection = 'teacher';
    } else if (isCoardSection) {
      this.currentSection = 'coard';
    } else if (isMasterSection) {
      this.currentSection = 'master';
    } else if (isAdminSection) {
      this.currentSection = 'admin';
    }

    this.shouldRun = (isAdminSection || isTeacherSection || isCoardSection || isMasterSection) && !isLoginPage;
  }
}

@Component({
  selector: 'logout-confirmation-dialog',
  template: `
    <div class="logout-dialog-content">
      <div class="logout-icon-container">
        <mat-icon class="large-logout-icon">logout</mat-icon>
      </div>
      <h2 mat-dialog-title>Confirm Logout</h2>
      <mat-dialog-content>Are you sure you want to logout?</mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button [mat-dialog-close]="false">Cancel</button>
        <button mat-raised-button color="warn" [mat-dialog-close]="true">Logout</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .logout-dialog-content {
        padding: 24px;
        text-align: center;
      }

      .logout-icon-container {
        display: flex;
        justify-content: center;
        margin-bottom: 16px;
      }

      .large-logout-icon {
        color: #f44336;
        font-size: 64px;
        height: 64px;
        opacity: 0.9;
        width: 64px;
      }

      h2 {
        color: #2c3e50;
        font-size: 24px;
        font-weight: 500;
        margin: 0 0 16px;
      }

      mat-dialog-content {
        color: #5a6268;
        font-size: 16px;
        margin-bottom: 24px;
      }

      mat-dialog-actions {
        gap: 12px;
        justify-content: flex-end;
        margin-bottom: 0;
        padding: 8px 0 0;
      }
    `,
  ],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
})
export class LogoutConfirmationDialog {}


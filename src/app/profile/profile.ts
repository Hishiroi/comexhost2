import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService } from '../core/services/auth.service';
import { UserService } from '../core/services/user.service';
import { SelfProfilePayload, UserPublicProfile } from '../core/models/auth.models';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  @ViewChild('editProfileModal') editProfileModal!: TemplateRef<unknown>;

  /** Keep ref so we can close after save */
  private editDialogRef: MatDialogRef<unknown> | null = null;

  readonly user = signal<UserPublicProfile | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  /** Shown inside the edit dialog when save fails (banner is behind the modal). */
  readonly dialogError = signal('');

  /** Only these values are offered in the profile editor. */
  readonly civilStatusOptions = ['Single', 'Married', 'Widow'] as const;

  readonly editForm = this.fb.group({
    mobile_phone: [''],
    telephone: [''],
    address: [''],
    department_subject: [''],
    employee_id: [''],
    emergency_contact_name: [''],
    emergency_contact_phone: [''],
    office_room: [''],
    civil_status: [''],
    nationality: [''],
    notes_other: [''],
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.userService.getMyProfile().subscribe({
      next: (res) => {
        this.user.set(res.user);
        this.patchForm(res.user);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.describe(err, 'Failed to load profile.'));
      },
    });
  }

  private patchForm(u: UserPublicProfile): void {
    this.editForm.patchValue({
      mobile_phone: u.mobile_phone ?? '',
      telephone: u.telephone ?? '',
      address: u.address ?? '',
      department_subject: u.department_subject ?? '',
      employee_id: u.employee_id ?? '',
      emergency_contact_name: u.emergency_contact_name ?? '',
      emergency_contact_phone: u.emergency_contact_phone ?? '',
      office_room: u.office_room ?? '',
      civil_status: normalizeCivilStatusForForm(u.civil_status),
      nationality: u.nationality ?? '',
      notes_other: u.notes_other ?? '',
    });
  }

  /** Read-only label for civil status (handles legacy API values). */
  civilStatusLabel(raw: string | null | undefined): string {
    const c = String(raw ?? '').trim();
    if (!c) return '—';
    const n = c.toLowerCase();
    if (n === 'widowed' || n === 'widow') return 'Widow';
    if (n === 'single') return 'Single';
    if (n === 'married') return 'Married';
    return c;
  }

  userLevelDisplay(u: UserPublicProfile): string {
    switch (Number(u.role_level)) {
      case 1:
        return 'Teacher';
      case 2:
        return 'Coordinator';
      case 3:
        return 'Master';
      default:
        return 'User';
    }
  }

  /** System role level (1–3) shown for Coordinator and Master. */
  roleLevelNumber(u: UserPublicProfile): number | null {
    const n = Number(u.role_level);
    return n >= 1 && n <= 3 ? n : null;
  }

  isCoordinatorOrMaster(u: UserPublicProfile): boolean {
    const n = Number(u.role_level);
    return n === 2 || n === 3;
  }

  isTeacherRole(u: UserPublicProfile): boolean {
    return Number(u.role_level) === 1;
  }

  isCoordinatorRole(u: UserPublicProfile): boolean {
    return Number(u.role_level) === 2;
  }

  isMasterRole(u: UserPublicProfile): boolean {
    return Number(u.role_level) === 3;
  }

  goBack(): void {
    const r = this.auth.roleLevel();
    if (r === 1 || r === 2 || r === 3 || r === 4) {
      void this.router.navigateByUrl(AuthService.routeFor(r));
    } else {
      void this.router.navigateByUrl('/login');
    }
  }

  openEditProfileModal(): void {
    const u = this.user();
    if (!u || !this.editProfileModal) return;
    this.dialogError.set('');
    this.patchForm(u);
    this.editDialogRef = this.dialog.open(this.editProfileModal, {
      width: 'min(560px, 96vw)',
      maxWidth: '96vw',
      maxHeight: '90vh',
      panelClass: 'comex-profile-edit-dialog-panel',
      autoFocus: 'dialog',
      restoreFocus: true,
    });
    this.editDialogRef.afterClosed().subscribe(() => {
      this.editDialogRef = null;
    });
  }

  cancelEditModal(): void {
    this.editDialogRef?.close(false);
  }

  submitEditModal(): void {
    const u = this.user();
    if (!u || this.saving()) return;
    this.dialogError.set('');

    const body: SelfProfilePayload = {
      mobile_phone: nzEmpty(this.editForm.value.mobile_phone),
      telephone: nzEmpty(this.editForm.value.telephone),
      address: nzEmpty(this.editForm.value.address),
      department_subject: nzEmpty(this.editForm.value.department_subject),
      employee_id: nzEmpty(this.editForm.value.employee_id),
      emergency_contact_name: nzEmpty(this.editForm.value.emergency_contact_name),
      emergency_contact_phone: nzEmpty(this.editForm.value.emergency_contact_phone),
      office_room: nzEmpty(this.editForm.value.office_room),
      civil_status: nzEmpty(this.editForm.value.civil_status),
      nationality: nzEmpty(this.editForm.value.nationality),
      notes_other: nzEmpty(this.editForm.value.notes_other),
    };

    this.saving.set(true);

    this.userService.patchMyProfile(body).subscribe({
      next: (res) => {
        this.user.set(res.user);
        this.patchForm(res.user);
        this.saving.set(false);
        this.successMessage.set('Profile saved.');
        this.editDialogRef?.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = this.describe(err, 'Failed to save profile.');
        this.dialogError.set(msg);
      },
    });
  }

  private describe(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server.';
      const b = err.error as { error?: string } | null;
      if (b && typeof b.error === 'string') return b.error;
      return `${fallback} (HTTP ${err.status}).`;
    }
    return fallback;
  }
}

function nzEmpty(v: string | null | undefined): string | null {
  const t = String(v ?? '').trim();
  return t.length ? t : null;
}

/** Map API values into one of the three dropdown choices, or ''. */
function normalizeCivilStatusForForm(raw: string | null | undefined): string {
  const c = String(raw ?? '').trim();
  if (!c) return '';
  const n = c.toLowerCase();
  if (n === 'widowed' || n === 'widow') return 'Widow';
  if (n === 'single') return 'Single';
  if (n === 'married') return 'Married';
  return '';
}

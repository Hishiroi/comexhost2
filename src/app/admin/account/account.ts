import { Component, OnInit, TemplateRef, ViewChild, inject, signal } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { HttpErrorResponse } from '@angular/common/http';



import { ManagedUser, UserService } from '../../core/services/user.service';

import { AuthService } from '../../core/services/auth.service';

import { AdminUserUpdatePayload, RoleLevel } from '../../core/models/auth.models';



type ModalMode = 'create' | 'edit' | null;



type EditorLevelLabel = 'Teacher' | 'Coordinator' | 'Master';



const LABEL_TO_LEVEL: Record<EditorLevelLabel, RoleLevel> = {

  Teacher: 1,

  Coordinator: 2,

  Master: 3,

};



const LEVEL_TO_LABEL: Record<number, string> = {

  1: 'Teacher',

  2: 'Coordinator',

  3: 'Master',

  4: 'Principal',

};



const TEACHER_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;



interface AccountRow {

  id: number;

  email: string;

  name: string;

  userLevel: string;

  role_level: number;

  teacher_rank: number | null;

}



@Component({

  selector: 'app-account',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],

  templateUrl: './account.html',

  styleUrl: './account.css',

})

export class Account implements OnInit {
  private readonly userService = inject(UserService);

  private readonly auth = inject(AuthService);

  private readonly dialog = inject(MatDialog);

  @ViewChild('accountModal') accountModal!: TemplateRef<unknown>;

  private accountDialogRef: MatDialogRef<unknown> | null = null;

  modalMode: ModalMode = null;

  editingId: number | null = null;

  /** Editing own Principal row — name / email / password only. */

  isEditingPrincipalSelf = false;



  accounts: AccountRow[] = [];

  accountSearchDraft = '';

  appliedAccountSearchNorm = '';



  readonly loading = signal(false);

  readonly submitting = signal(false);

  readonly errorMessage = signal('');

  readonly successMessage = signal('');



  /** Account-level fields only (Principal does not manage profile/contact data here). */

  formData = {

    email: '',

    name: '',

    password: '',

    userLevel: 'Teacher' as EditorLevelLabel,

    teacher_level: 1 as (typeof TEACHER_LEVELS)[number],

    is_active: true,

  };



  readonly teacherLevels = TEACHER_LEVELS;



  ngOnInit(): void {

    this.loadAccounts();

  }



  principalId(): number | null {

    return this.auth.user()?.id ?? null;

  }



  canEdit(row: AccountRow): boolean {

    return row.role_level !== 4 || row.id === this.principalId();

  }



  canDelete(row: AccountRow): boolean {

    return row.role_level !== 4 && row.id !== this.principalId();

  }



  loadAccounts(): void {

    this.loading.set(true);

    this.errorMessage.set('');

    this.userService.list().subscribe({

      next: (res) => {

        this.loading.set(false);

        this.accounts = res.users.map((u: ManagedUser) => ({

          id: u.id,

          email: u.email,

          name: u.name,

          role_level: u.role_level,

          userLevel: LEVEL_TO_LABEL[u.role_level] ?? 'User',

          teacher_rank: u.teacher_rank ?? null,

        }));

      },

      error: (err) => {

        this.loading.set(false);

        this.errorMessage.set(this.describe(err, 'Failed to load accounts.'));

      },

    });

  }



  openCreateModal(): void {

    this.isEditingPrincipalSelf = false;

    this.successMessage.set('');

    this.errorMessage.set('');

    this.modalMode = 'create';

    this.editingId = null;

    this.resetFormFields();

    this.formData.password = this.suggestPassword();

    this.formData.userLevel = 'Teacher';

    this.formData.teacher_level = 1;

    this.openAccountDialog();
  }



  openEditModal(row: AccountRow): void {

    if (!this.canEdit(row)) return;

    this.isEditingPrincipalSelf = row.role_level === 4 && row.id === this.principalId();

    this.successMessage.set('');

    this.errorMessage.set('');

    this.modalMode = 'edit';

    this.editingId = row.id;



    this.submitting.set(true);

    this.userService.getById(row.id).subscribe({

      next: (res) => {

        this.submitting.set(false);

        const u = res.user;

        if (this.isEditingPrincipalSelf) {

          this.formData = {

            email: u.email,

            name: u.name,

            password: '',

            userLevel: 'Teacher',

            teacher_level: 1,

            is_active: true,

          };

          this.openAccountDialog();

          return;

        }

        const lvl: EditorLevelLabel =

          u.role_level === 1

            ? 'Teacher'

            : u.role_level === 2

              ? 'Coordinator'

              : u.role_level === 3

                ? 'Master'

                : 'Coordinator';

        this.formData = {

          email: u.email,

          name: u.name,

          password: '',

          userLevel: lvl,

          teacher_level: ((u.role_level === 1 ||
          u.role_level === 2 ||
          u.role_level === 3
            ? u.teacher_rank
            : null) ?? 1) as (typeof TEACHER_LEVELS)[number],

          is_active: Boolean(Number(u.is_active ?? 1)),

        };

        this.openAccountDialog();

      },

      error: (err) => {

        this.submitting.set(false);

        this.modalMode = null;

        this.editingId = null;

        this.isEditingPrincipalSelf = false;

        this.errorMessage.set(this.describe(err, 'Failed to load account.'));

      },

    });

  }



  /** Same shell as profile edit (`comex-profile-edit-dialog-panel`). */

  private openAccountDialog(): void {

    setTimeout(() => {

      if (!this.accountModal || this.accountDialogRef) {

        return;

      }

      this.accountDialogRef = this.dialog.open(this.accountModal, {

        width: 'min(560px, 96vw)',

        maxWidth: '96vw',

        maxHeight: '90vh',

        panelClass: 'comex-profile-edit-dialog-panel',

        autoFocus: 'dialog',

        restoreFocus: true,

      });

      this.accountDialogRef.afterClosed().subscribe(() => {

        this.accountDialogRef = null;

        this.modalMode = null;

        this.editingId = null;

        this.isEditingPrincipalSelf = false;

      });

    }, 0);

  }

  closeModal(): void {

    this.accountDialogRef?.close();

  }



  resetFormFields(): void {

    this.formData = {

      email: '',

      name: '',

      password: '',

      userLevel: 'Teacher',

      teacher_level: 1,

      is_active: true,

    };

  }



  showRankLevel(): boolean {

    return (

      this.formData.userLevel === 'Teacher' ||

      this.formData.userLevel === 'Coordinator' ||

      this.formData.userLevel === 'Master'

    );

  }



  rankSelectLabel(): string {

    if (this.formData.userLevel === 'Teacher') return 'Teacher level (1–7)';

    if (this.formData.userLevel === 'Coordinator') return 'Coordinator level (1–7)';

    return 'Master level (1–7)';

  }



  /** Table cell: Teacher / Coordinator / Master skill rank (1–7). */

  accountLevelDisplay(row: AccountRow): string {

    if (row.role_level === 1 || row.role_level === 2 || row.role_level === 3) {

      return row.teacher_rank != null ? String(row.teacher_rank) : '—';

    }

    return '—';

  }



  applyAccountSearch(): void {

    this.appliedAccountSearchNorm = this.accountSearchDraft.trim().toLowerCase();

  }



  clearAccountSearch(): void {

    this.accountSearchDraft = '';

    this.appliedAccountSearchNorm = '';

  }



  get filteredAccounts(): AccountRow[] {

    const q = this.appliedAccountSearchNorm;

    if (!q) return this.accounts;

    return this.accounts.filter((row) => this.accountRowMatches(row, q));

  }



  private accountRowMatches(row: AccountRow, q: string): boolean {

    const blob = [String(row.id), row.email, row.name, row.userLevel, this.accountLevelDisplay(row)].join('\n');

    return blob.toLowerCase().includes(q);

  }



  submitModal(): void {

    if (this.modalMode === 'create') this.createAccount();

    else if (this.modalMode === 'edit') this.saveEdit();

  }



  createAccount(): void {

    const { email, name, password, userLevel } = this.formData;

    if (!email.trim() || !name.trim() || !password) {

      this.errorMessage.set('Email, name and password are required.');

      return;

    }

    if (!passwordValid(password)) {

      this.errorMessage.set('Password must be at least 8 characters and contain letters and digits.');

      return;

    }

    if (!email.toLowerCase().trim().endsWith('@gmail.com') && userLevel === 'Teacher') {

      this.errorMessage.set('Teacher accounts must use a Gmail address (@gmail.com).');

      return;

    }



    this.submitting.set(true);

    this.errorMessage.set('');

    this.successMessage.set('');



    const payload: Parameters<UserService['create']>[0] = {

      email: email.trim().toLowerCase(),

      name: name.trim(),

      password,

      role_level: LABEL_TO_LEVEL[userLevel],

    };

    if (userLevel === 'Teacher' || userLevel === 'Coordinator' || userLevel === 'Master') {

      payload.teacher_rank = Number(this.formData.teacher_level);

    }



    this.userService.create(payload).subscribe({

      next: () => {

        this.submitting.set(false);

        this.successMessage.set(`Created account for ${name.trim()}.`);

        this.closeModal();

        this.loadAccounts();

      },

      error: (err) => {

        this.submitting.set(false);

        this.errorMessage.set(this.describe(err, 'Failed to create account.'));

      },

    });

  }



  saveEdit(): void {

    if (this.editingId == null) return;

    const id = this.editingId;



    const { email, name } = this.formData;

    if (!email.trim() || !name.trim()) {

      this.errorMessage.set('Email and name are required.');

      return;

    }



    let body: AdminUserUpdatePayload;



    if (this.isEditingPrincipalSelf) {

      body = {

        name: name.trim(),

        email: email.toLowerCase().trim(),

      };

    } else {

      const { userLevel } = this.formData;

      if (!email.toLowerCase().trim().endsWith('@gmail.com') && LABEL_TO_LEVEL[userLevel] === 1) {

        this.errorMessage.set('Teacher accounts must use a Gmail address (@gmail.com).');

        return;

      }

      if (userLevel === 'Teacher' || userLevel === 'Coordinator' || userLevel === 'Master') {

        const tr = Number(this.formData.teacher_level);

        if (!Number.isInteger(tr) || tr < 1 || tr > 7) {

          this.errorMessage.set('Teacher, Coordinator, or Master level must be 1–7.');

          return;

        }

      }

      const rl = LABEL_TO_LEVEL[userLevel];

      body = {

        name: name.trim(),

        email: email.trim().toLowerCase(),

        role_level: rl,

        teacher_rank:

          userLevel === 'Teacher' || userLevel === 'Coordinator' || userLevel === 'Master'

            ? Number(this.formData.teacher_level)

            : null,

        is_active: this.formData.is_active,

      };

    }



    const pwd = this.formData.password.trim();

    if (pwd) {

      if (!passwordValid(pwd)) {

        this.errorMessage.set('Password must be at least 8 characters and contain letters and digits.');

        return;

      }

      body.password = pwd;

    } else {

      delete body.password;

    }



    this.submitting.set(true);

    this.errorMessage.set('');

    this.successMessage.set('');



    this.userService.update(id, body).subscribe({

      next: () => {

        this.submitting.set(false);

        this.successMessage.set(`Updated account #${id}.`);

        this.closeModal();

        this.loadAccounts();

        if (id === this.principalId()) {

          const rl = body.role_level ?? (this.auth.roleLevel() as RoleLevel);

          this.auth.mergeStoredUser({

            name: body.name ?? '',

            email: body.email ?? '',

            role_level: rl,

            role: this.roleNameFromLevel(rl),

          });

        }

      },

      error: (err) => {

        this.submitting.set(false);

        this.errorMessage.set(this.describe(err, 'Failed to save account.'));

      },

    });

  }



  confirmDelete(row: AccountRow): void {

    if (!this.canDelete(row)) return;

    const ok =

      typeof window !== 'undefined' &&

      window.confirm(`Delete ${row.name} (#${row.id})? This cannot be undone.`);

    if (!ok) return;

    this.userService.delete(row.id).subscribe({

      next: () => {

        this.successMessage.set(`Deleted account #${row.id}.`);

        this.loadAccounts();

      },

      error: (err) => {

        this.errorMessage.set(this.describe(err, 'Cannot delete account.'));

      },

    });

  }



  private roleNameFromLevel(level: RoleLevel | undefined): 'teacher' | 'coordinator' | 'master' | 'admin' {

    switch (level) {

      case 1:

        return 'teacher';

      case 2:

        return 'coordinator';

      case 3:

        return 'master';

      default:

        return 'admin';

    }

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



  private suggestPassword(): string {

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

    const random =

      typeof crypto !== 'undefined' && crypto.getRandomValues

        ? () => {

            const arr = new Uint8Array(12);

            crypto.getRandomValues(arr);

            return Array.from(arr, (b) => alphabet[b % alphabet.length]).join('');

          }

        : () =>

            Array.from({ length: 12 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(

              '',

            );

    return random();

  }

}



function passwordValid(p: string): boolean {

  return p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

}


import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { FileService } from '../../core/services/file.service';
import { FileDoc } from '../../core/models/file.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly fileService = inject(FileService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly userName = this.auth.user()?.name ?? 'Master';

  /** System role level for this account (Master = 3). */
  get roleLevel(): number {
    return Number(this.auth.roleLevel() ?? 0);
  }

  /** 1–7 skill level stored as teacher_rank (same field as Teachers/Coordinators). */
  get masterSkillLevel(): number | null {
    const tr = this.auth.user()?.teacher_rank;
    const n = tr == null ? NaN : Number(tr);
    return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
  }

  awaitingMe = 0;
  total = 0;
  queue: FileDoc[] = [];

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.fileService.list().subscribe({
      next: (res) => {
        this.total = res.files.length;
        this.queue = res.files.filter(
          (f) => f.current_level === 3 && f.status !== 'finalized'
        );
        this.awaitingMe = this.queue.length;
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.describe(err));
      },
    });
  }

  open(file: FileDoc): void {
    void this.router.navigate(['/master/file'], { queryParams: { id: file.id } });
  }

  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      return `Failed to load dashboard (HTTP ${err.status}).`;
    }
    return 'Failed to load dashboard.';
  }
}

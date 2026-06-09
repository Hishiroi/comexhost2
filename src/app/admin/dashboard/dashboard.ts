import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { FileService } from '../../core/services/file.service';
import { FileDoc, documentTypeLabel, workflowStageLabel, workflowStatusTone } from '../../core/models/file.models';

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
  readonly userName = this.auth.user()?.name ?? 'Principal';

  readonly stageLabel = workflowStageLabel;
  readonly statusTone = workflowStatusTone;
  readonly docTypeLabel = documentTypeLabel;

  pending = 0;
  inReview = 0;
  finalized = 0;
  recent: FileDoc[] = [];

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.fileService.list().subscribe({
      next: (res) => {
        const files = res.files;
        this.pending = files.filter(
          (f) => f.status === 'uploaded' || f.status === 'returned'
        ).length;
        this.inReview = files.filter(
          (f) =>
            (f.status === 'reviewed_by_master' && f.current_level === 4) ||
            f.status === 'exam_principal'
        ).length;
        this.finalized = files.filter((f) => f.status === 'finalized').length;
        this.recent = files.slice(0, 8);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.describe(err));
      },
    });
  }

  open(file: FileDoc): void {
    void this.router.navigate(['/admin/files'], { queryParams: { id: file.id } });
  }

  goToAccounts(): void {
    void this.router.navigateByUrl('/admin/account');
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

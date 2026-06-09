import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { FileService } from '../../core/services/file.service';
import { FileDoc, workflowStageLabel, workflowStatusTone } from '../../core/models/file.models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly fileService = inject(FileService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly userName = this.auth.user()?.name ?? 'Teacher';

  readonly stageLabel = workflowStageLabel;
  readonly statusTone = workflowStatusTone;

  total = 0;
  pending = 0;
  finalized = 0;
  recent: FileDoc[] = [];

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.fileService.list({ mine: true }).subscribe({
      next: (res) => {
        const files = res.files;
        this.total = files.length;
        this.pending = files.filter((f) => f.status !== 'finalized').length;
        this.finalized = files.filter((f) => f.status === 'finalized').length;
        this.recent = files.slice(0, 5);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.describe(err));
      },
    });
  }

  open(file: FileDoc): void {
    void this.router.navigate(['/teacher/file'], { queryParams: { id: file.id } });
  }

  goToUpload(): void {
    void this.router.navigateByUrl('/teacher/upload');
  }

  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      return `Failed to load (HTTP ${err.status}).`;
    }
    return 'Failed to load.';
  }
}

import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { FileReview } from '../../core/components/file-review/file-review';

@Component({
  selector: 'app-file',
  standalone: true,
  imports: [CommonModule, FileReview],
  templateUrl: './file.html',
  styleUrl: './file.css',
})
export class File implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  fileId: number | null = null;
  private routeSub?: Subscription;

  constructor() {
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const raw = params.get('id');
      const parsed = raw == null ? NaN : Number(raw);
      this.fileId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  backToDocuments(): void {
    void this.router.navigateByUrl('/teacher/documents');
  }
}

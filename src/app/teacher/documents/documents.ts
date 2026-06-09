import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { FileService } from '../../core/services/file.service';
import {
  CommentAction,
  DocumentType,
  FileComment,
  FileDoc,
  FileStatus,
  documentTypeLabel,
  customStopsResolved,
} from '../../core/models/file.models';

type DocumentStatus = 'Pending' | 'Checked' | 'For Revision' | 'Skipped';

interface DocRow {
  id: number;
  name: string;
  documentType: DocumentType;
  documentTypeLabel: string;
  submittedBy: string;
  submittedOn: Date;
  step2Header: string;
  step3Header: string;
  coordChecked: string;
  coordStatus: DocumentStatus;
  step2Checked: string;
  step2Status: DocumentStatus;
  step3Checked: string;
  step3Status: DocumentStatus;
  revisions: string;
  status: FileStatus;
  current_level: number;
}

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './documents.html',
  styleUrl: './documents.css',
})
export class Documents implements OnInit {
  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);

  rows: DocRow[] = [];
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  searchDraft = '';
  appliedSearchNorm = '';

  ngOnInit(): void {
    this.loadDocuments();
  }

  /**
   * Pulls the teacher's submissions from the backend (single source of
   * truth). Called on every navigation/refresh, so any change made by
   * a Coordinator/Master/Principal is reflected immediately.
   */
  loadDocuments(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.fileService.list({ mine: true }).subscribe({
      next: (res) => {
        const files = res.files;
        if (files.length === 0) {
          this.rows = [];
          this.loading.set(false);
          return;
        }

        // Fan out to fetch comments per file so we can compute
        // per-stage reviewer + status.
        const detailRequests = files.map((f) =>
          this.fileService.get(f.id).toPromise().then((d) => ({ id: f.id, d }))
        );

        Promise.all(detailRequests)
          .then((pairs) => {
            this.rows = pairs
              .filter(
                (p): p is { id: number; d: { file: FileDoc; comments: FileComment[] } } =>
                  !!p.d &&
                  p.d.file != null &&
                  Number(p.d.file.id) === Number(p.id)
              )
              .map((p) => this.toRow(p.d.file, p.d.comments));
            this.loading.set(false);
          })
          .catch((err) => {
            this.loading.set(false);
            this.errorMessage.set(this.describe(err));
          });
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.describe(err));
      },
    });
  }

  navigateHome(): void {
    void this.router.navigateByUrl('/teacher/home');
  }

  openDocument(row: DocRow): void {
    void this.router.navigate(['/teacher/file'], { queryParams: { id: row.id } });
  }

  applySearch(): void {
    this.appliedSearchNorm = this.searchDraft.trim().toLowerCase();
  }

  clearSearch(): void {
    this.searchDraft = '';
    this.appliedSearchNorm = '';
  }

  get displayRows(): DocRow[] {
    const q = this.appliedSearchNorm;
    if (!q) return this.rows;
    return this.rows.filter((r) => this.rowMatchesSearch(r, q));
  }

  private rowMatchesSearch(r: DocRow, q: string): boolean {
    const blob = [
      String(r.id),
      r.documentTypeLabel,
      r.name,
      r.submittedBy,
      String(r.submittedOn),
      r.coordChecked,
      r.coordStatus,
      r.step2Header,
      r.step2Checked,
      r.step2Status,
      r.step3Header,
      r.step3Checked,
      r.step3Status,
      r.revisions,
      String(r.current_level),
      r.status,
    ].join('\n');
    return blob.toLowerCase().includes(q);
  }

  private toRow(file: FileDoc, comments: FileComment[]): DocRow {
    const dtype = file.document_type ?? 'dlp';

    const openRevisionAt = (level: 2 | 3 | 4): boolean =>
      comments.some(
        (c) =>
          Number(c.role_level) === level &&
          c.action === 'revision' &&
          !c.resolved_at
      );

    const lastCheckpointReviewer = (level: 2 | 3 | 4): string =>
      [...comments]
        .reverse()
        .find(
          (c) =>
            Number(c.role_level) === level &&
            (c.action === 'forward' || c.action === 'finalize')
        )
        ?.user.name ?? 'N/A';

    if (dtype === 'custom') {
      const stops = customStopsResolved(file);
      const hasC = stops.includes(2);
      const hasM = stops.includes(3);
      const hasP = stops.includes(4);
      const cur = Number(file.current_level);

      const revisions =
        comments
          .filter((c) => c.action === 'revision')
          .map((c) => `${c.role}: ${c.body}`)
          .join(' | ') || (file.status === 'finalized' ? 'Approved' : 'Awaiting review');

      const statusAt = (level: 2 | 3 | 4): DocumentStatus => {
        if (file.status === 'finalized') return 'Checked';
        if (!stops.includes(level)) return 'Skipped';
        if (cur > level) return 'Checked';
        if (cur === level) {
          return openRevisionAt(level) ? 'For Revision' : 'Pending';
        }
        return 'Pending';
      };

      return {
        id: file.id,
        name: file.original_name,
        documentType: dtype,
        documentTypeLabel: documentTypeLabel(dtype, file.custom_type_label),
        submittedBy: file.uploaded_by.name,
        submittedOn: new Date(file.created_at),
        step2Header: 'Master',
        step3Header: 'Principal',
        coordChecked: hasC ? lastCheckpointReviewer(2) : 'N/A',
        coordStatus: hasC ? statusAt(2) : 'Skipped',
        step2Checked: hasM ? lastCheckpointReviewer(3) : 'N/A',
        step2Status: hasM ? statusAt(3) : 'Skipped',
        step3Checked: hasP ? lastCheckpointReviewer(4) : 'N/A',
        step3Status: hasP ? statusAt(4) : 'Skipped',
        revisions,
        status: file.status,
        current_level: file.current_level,
      };
    }

    const revisions =
      comments
        .filter((c) => c.action === 'revision')
        .map((c) => `${c.role}: ${c.body}`)
        .join(' | ') || (file.status === 'finalized' ? 'Approved' : 'Awaiting review');

    if (dtype === 'examination') {
      const cur = Number(file.current_level);

      let coordStatus: DocumentStatus;
      if (file.status === 'finalized') {
        coordStatus = 'Checked';
      } else if (cur === 2 && file.status === 'uploaded') {
        coordStatus = openRevisionAt(2) ? 'For Revision' : 'Pending';
      } else if (cur > 2) {
        coordStatus = 'Checked';
      } else {
        coordStatus = 'Pending';
      }

      let masterStatus: DocumentStatus;
      if (file.status === 'finalized') {
        masterStatus = 'Checked';
      } else if (file.status === 'exam_master' && cur === 3) {
        masterStatus = openRevisionAt(3) ? 'For Revision' : 'Pending';
      } else if (cur > 3 || file.status === 'exam_principal') {
        masterStatus = 'Checked';
      } else {
        masterStatus = 'Pending';
      }

      let principalStatus: DocumentStatus;
      if (file.status === 'finalized') {
        principalStatus = 'Checked';
      } else if (file.status === 'exam_principal' && cur === 4) {
        principalStatus = openRevisionAt(4) ? 'For Revision' : 'Pending';
      } else {
        principalStatus = 'Pending';
      }

      return {
        id: file.id,
        name: file.original_name,
        documentType: dtype,
        documentTypeLabel: documentTypeLabel(dtype),
        submittedBy: file.uploaded_by.name,
        submittedOn: new Date(file.created_at),
        step2Header: 'Master',
        step3Header: 'Principal',
        coordChecked: coordStatus === 'Checked' ? lastCheckpointReviewer(2) : 'N/A',
        coordStatus,
        step2Checked: masterStatus === 'Checked' ? lastCheckpointReviewer(3) : 'N/A',
        step2Status: masterStatus,
        step3Checked: principalStatus === 'Checked' ? lastCheckpointReviewer(4) : 'N/A',
        step3Status: principalStatus,
        revisions,
        status: file.status,
        current_level: file.current_level,
      };
    }

    const coordinatorInDlpPath =
      comments.some((c) => Number(c.role_level) === 2 && c.action === 'forward') ||
      Number(file.current_level) === 2 ||
      file.status === 'reviewed_by_coordinator';
    const step2Header = 'Master';
    const step3Header = 'Principal';

    const curLevel = Number(file.current_level);

    const stage = (level: 2 | 3 | 4) => {
      const acted = comments.find((c) => Number(c.role_level) === level);
      const isCheckpoint = (a: CommentAction) =>
        a === 'forward' || a === 'finalize' || a === 'comment' || a === 'revision';
      const checkpoint = comments.find(
        (c) => Number(c.role_level) === level && isCheckpoint(c.action)
      );

      let status: DocumentStatus = 'Pending';
      if (curLevel > level) {
        status = 'Checked';
      } else if (curLevel === level) {
        const hasOpenRev = comments.some(
          (c) =>
            Number(c.role_level) === level &&
            c.action === 'revision' &&
            !c.resolved_at
        );
        status = hasOpenRev ? 'For Revision' : 'Pending';
      } else if (level === 4 && file.status === 'finalized') {
        status = 'Checked';
      }

      return {
        reviewer: (checkpoint ?? acted)?.user.name ?? 'N/A',
        status,
      };
    };

    const coord = stage(2);
    const master = stage(3);
    const principal = stage(4);
    if (file.status === 'finalized') {
      principal.status = 'Checked';
    }

    if (!coordinatorInDlpPath) {
      return {
        id: file.id,
        name: file.original_name,
        documentType: dtype,
        documentTypeLabel: documentTypeLabel(dtype),
        submittedBy: file.uploaded_by.name,
        submittedOn: new Date(file.created_at),
        step2Header,
        step3Header,
        coordChecked: 'Not in workflow',
        coordStatus: 'Skipped',
        step2Checked: master.reviewer,
        step2Status: master.status,
        step3Checked: principal.reviewer,
        step3Status: principal.status,
        revisions,
        status: file.status,
        current_level: file.current_level,
      };
    }

    return {
      id: file.id,
      name: file.original_name,
      documentType: dtype,
      documentTypeLabel: documentTypeLabel(dtype),
      submittedBy: file.uploaded_by.name,
      submittedOn: new Date(file.created_at),
      step2Header,
      step3Header,
      coordChecked: coord.reviewer,
      coordStatus: coord.status,
      step2Checked: master.reviewer,
      step2Status: master.status,
      step3Checked: principal.reviewer,
      step3Status: principal.status,
      revisions,
      status: file.status,
      current_level: file.current_level,
    };
  }

  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      return `Failed to load documents (HTTP ${err.status}).`;
    }
    return 'Failed to load documents.';
  }
}

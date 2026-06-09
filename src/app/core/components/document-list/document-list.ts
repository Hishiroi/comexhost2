import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { FileService } from '../../services/file.service';
import {
  DocumentType,
  FileDoc,
  FileStatus,
  documentTypeLabel,
  workflowStageLabel,
  workflowStatusTone,
} from '../../models/file.models';

interface ListRow {
  id: number;
  name: string;
  title: string;
  documentType: DocumentType;
  typeLabel: string;
  submittedBy: string;
  submittedOn: Date;
  status: FileStatus;
  statusLabel: string;
  statusTone: 'pending' | 'in-review' | 'done';
  currentLevel: number;
}

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-list.html',
  styleUrl: './document-list.css',
})
export class DocumentList implements OnInit {
  /** Where to navigate when a row is clicked. */
  @Input({ required: true }) detailRoute!: string;

  /**
   * Optional `mine=1` filter. Set true on a Teacher's "my documents"
   * page. Coordinator/Master/Admin should leave it false so they see
   * the queue assigned to them by the backend.
   */
  @Input() mineOnly = false;

  /**
   * Optional `history=1` filter. Used by the Coordinator/Master
   * "History" tab to show only files that have already moved past
   * their stage (or are finalized). Backend enforces visibility.
   */
  @Input() historyOnly = false;

  /** Heading shown when there are no rows to display. */
  @Input() emptyMessage = 'No documents to show.';

  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);

  rows: ListRow[] = [];
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  /** Text in the search box (applied when Search runs). */
  searchDraft = '';
  /** Lowercase trimmed filter substring. */
  appliedSearchNorm = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.fileService
      .list({ mine: this.mineOnly, history: this.historyOnly })
      .subscribe({
        next: (res) => {
          this.rows = res.files.map((f) => this.toRow(f));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.errorMessage.set(this.describe(err));
        },
      });
  }

  applySearch(): void {
    this.appliedSearchNorm = this.searchDraft.trim().toLowerCase();
  }

  clearSearch(): void {
    this.searchDraft = '';
    this.appliedSearchNorm = '';
  }

  get displayRows(): ListRow[] {
    const q = this.appliedSearchNorm;
    if (!q) return this.rows;
    return this.rows.filter((r) => this.rowMatchesSearch(r, q));
  }

  open(row: ListRow): void {
    void this.router.navigate([this.detailRoute], {
      queryParams: { id: row.id },
    });
  }

  private rowMatchesSearch(r: ListRow, q: string): boolean {
    const blob = [
      String(r.id),
      r.title,
      r.name,
      r.typeLabel,
      r.submittedBy,
      r.statusLabel,
      String(r.currentLevel),
    ].join('\n');
    return blob.toLowerCase().includes(q);
  }

  private toRow(f: FileDoc): ListRow {
    const documentType = f.document_type ?? 'dlp';
    return {
      id: f.id,
      name: f.original_name,
      title: f.title,
      documentType,
      typeLabel: documentTypeLabel(documentType, f.custom_type_label),
      submittedBy: f.uploaded_by.name,
      submittedOn: new Date(f.created_at),
      status: f.status,
      statusLabel: workflowStageLabel(f),
      statusTone: workflowStatusTone(f),
      currentLevel: f.current_level,
    };
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

import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { AuthService } from '../../core/services/auth.service';
import { FileService } from '../../core/services/file.service';
import { FileDoc, customStopsResolved } from '../../core/models/file.models';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload.html',
  styleUrl: './upload.css',
})
export class Upload implements OnDestroy {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private readonly sanitizer = inject(DomSanitizer);
  private readonly fileService = inject(FileService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  isDragging = false;
  selectedFile: globalThis.File | null = null;
  uploadError = '';

  title = '';
  description = '';
  /** Optional extra notes (maps to `more_details` on the server). */
  additionalDetails = '';
  /**
   * "More" — custom document type label. When set, predefined workflow is
   * locked; pick reviewers with the toggles.
   */
  moreCustomType = '';
  customMode = false;

  pickCoordinator = false;
  pickMaster = false;
  pickPrincipal = false;

  /** Workflow for predefined types only (locked when using custom "More"). */
  documentType: 'dlp' | 'examination' = 'dlp';

  documentName = '';
  submittedBy = this.auth.user()?.name ?? 'You';
  submittedAt: Date | null = null;
  pdfUrl: SafeResourceUrl | null = null;

  readonly submitting = signal(false);
  readonly successMessage = signal('');

  private pdfObjectUrl: string | null = null;

  ngOnDestroy(): void {
    this.revokePdfObjectUrl();
  }

  triggerFilePicker(): void {
    this.uploadError = '';
    this.fileInput?.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.handleSelectedFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handleSelectedFile(file);
  }

  cancelSelection(): void {
    this.selectedFile = null;
    this.uploadError = '';
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }

  toggleStop(level: 2 | 3 | 4): void {
    if (level === 2) this.pickCoordinator = !this.pickCoordinator;
    if (level === 3) this.pickMaster = !this.pickMaster;
    if (level === 4) this.pickPrincipal = !this.pickPrincipal;
  }

  /** Sorted ascending: Coordinator → Master → Principal. */
  private selectedStopsSorted(): number[] {
    const s: number[] = [];
    if (this.pickCoordinator) s.push(2);
    if (this.pickMaster) s.push(3);
    if (this.pickPrincipal) s.push(4);
    return s;
  }

  submitUpload(): void {
    if (!this.selectedFile || this.submitting()) return;
    if (!this.title.trim()) {
      this.uploadError = 'Please enter a title.';
      return;
    }

    const customLabel = this.moreCustomType.trim();
    if (customLabel) {
      const stops = this.selectedStopsSorted();
      if (stops.length === 0) {
        this.uploadError =
          'Pick at least one reviewer (Coordinator, Master, and/or Principal).';
        return;
      }
    }

    this.submitting.set(true);
    this.uploadError = '';
    this.successMessage.set('');

    const extra = this.additionalDetails.trim() || undefined;
    const stops = this.selectedStopsSorted();
    const uploadReq = customLabel
      ? this.fileService.upload(
          this.selectedFile,
          this.title.trim(),
          this.description.trim() || undefined,
          'dlp',
          extra,
          customLabel,
          stops
        )
      : this.fileService.upload(
          this.selectedFile,
          this.title.trim(),
          this.description.trim() || undefined,
          this.documentType,
          extra
        );

    uploadReq.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.documentName = res.file.original_name;
        this.submittedAt = new Date(res.file.created_at);
        this.setPdfPreview(this.selectedFile!);
        this.successMessage.set(uploadSuccessMessage(res.file));
        this.title = '';
        this.description = '';
        this.additionalDetails = '';
        this.moreCustomType = '';
        this.customMode = false;
        this.pickCoordinator = false;
        this.pickMaster = false;
        this.pickPrincipal = false;
        this.documentType = 'dlp';
        this.cancelSelection();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.uploadError = this.describe(err);
      },
    });
  }

  goToDocuments(): void {
    void this.router.navigateByUrl('/teacher/documents');
  }

  onMoreCustomChange(): void {
    this.customMode = this.moreCustomType.trim().length > 0;
  }

  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server. Please try again.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      if (err.status === 413) return 'File is too large.';
      if (err.status === 401) return 'Your session expired. Please log in again.';
      if (err.status === 403) return 'You are not allowed to perform this action.';
      return `Upload failed (HTTP ${err.status}).`;
    }
    return 'Upload failed.';
  }

  private handleSelectedFile(file: globalThis.File): void {
    this.uploadError = '';
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      this.selectedFile = null;
      this.uploadError = 'Only PDF files are supported.';
      return;
    }
    this.selectedFile = file;
    if (!this.title) this.title = file.name.replace(/\.pdf$/i, '');
    this.setPdfPreview(file);
  }

  private setPdfPreview(file: Blob): void {
    this.revokePdfObjectUrl();
    this.pdfObjectUrl = URL.createObjectURL(file);
    this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl);
  }

  private revokePdfObjectUrl(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
  }
}

function uploadSuccessMessage(file: FileDoc): string {
  if (file.document_type === 'custom') {
    const stops = customStopsResolved(file);
    const first = stops[0];
    if (first === 2) {
      return 'Upload submitted. Custom document is with the Coordinator first.';
    }
    if (first === 3) {
      return 'Upload submitted. Custom document is with the Master first.';
    }
    return 'Upload submitted. Custom document is with the Principal first.';
  }
  if (file.document_type === 'examination') {
    return 'Upload submitted. Examination document is with the Coordinator.';
  }
  return 'Upload submitted. DLP document is with the Master (Coordinator is not in this workflow).';
}

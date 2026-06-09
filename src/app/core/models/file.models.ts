import { RoleLevel, RoleName } from './auth.models';

/** DLP: Master → Principal (finalize). Examination: Coordinator → Master → Principal. Custom: teacher-selected stops. */
export type DocumentType = 'dlp' | 'examination' | 'custom';

/** @deprecated Legacy API; prefer `custom_stops`. */
export type CustomRoute = 'master_only' | 'principal_only' | 'both';

export type FileStatus =
  | 'uploaded'
  | 'reviewed_by_coordinator'
  | 'reviewed_by_master'
  | 'exam_principal'
  | 'exam_master'
  | 'finalized'
  | 'returned';

export type CommentAction = 'comment' | 'revision' | 'forward' | 'finalize';

export interface FileDoc {
  id: number;
  title: string;
  description: string | null;
  /** Extra notes from the teacher. Omitted on older API responses. */
  more_details?: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  current_level: RoleLevel;
  current_role: RoleName;
  status: FileStatus;
  document_type: DocumentType;
  /** Custom document name from the teacher ("More"). */
  custom_type_label?: string | null;
  /** @deprecated */
  custom_route?: CustomRoute | null;
  /** Ordered reviewer chain: 2 = Coordinator, 3 = Master, 4 = Principal. */
  custom_stops?: number[] | null;
  uploaded_by: { id: number; name: string; email: string };
  created_at: string;
  updated_at: string;
}

export interface FileComment {
  id: number;
  file_id: number;
  action: CommentAction;
  body: string;
  role_level: RoleLevel;
  role: RoleName;
  user: { id: number; name: string; email: string };
  /**
   * Only meaningful for `action === 'revision'`. When non-null the
   * revision has been marked resolved; otherwise it's still pending
   * and will block forwarding to the next workflow level.
   */
  resolved_at: string | null;
  resolved_by: { id: number; name: string } | null;
  created_at: string;
}

export interface FileWithComments {
  file: FileDoc;
  comments: FileComment[];
}

export function documentTypeLabel(
  t: DocumentType | undefined,
  customLabel?: string | null
): string {
  if (t === 'custom') {
    const s = customLabel?.trim();
    return s ? `Custom (${s})` : 'Custom';
  }
  return t === 'examination' ? 'Examination' : 'DLP';
}

/** Resolve custom reviewer chain for display / UI (legacy fallback). */
export function customStopsResolved(
  f: Pick<FileDoc, 'document_type' | 'custom_stops' | 'custom_route'>
): number[] {
  if (f.document_type !== 'custom') return [];
  const allowed = new Set([2, 3, 4]);
  /** API may send JSON array or a serialized string; tolerate both at runtime. */
  const raw = f.custom_stops as number[] | string | null | undefined;
  let parsed: number[] = [];

  if (raw != null) {
    let arr: unknown[] | null = null;
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string' && raw.length > 0) {
      try {
        const j = JSON.parse(raw) as unknown;
        if (Array.isArray(j)) arr = j;
      } catch {
        arr = null;
      }
    }
    if (arr && arr.length > 0) {
      parsed = [...new Set(arr.map((x) => Number(x)).filter((n) => allowed.has(n)))].sort(
        (a, b) => a - b
      );
    }
  }
  if (parsed.length > 0) return parsed;

  const r = f.custom_route;
  if (r === 'principal_only') return [4];
  if (r === 'master_only') return [3];
  return [3, 4];
}

/** Human-readable routing stage for dashboards and lists. */
export function workflowStageLabel(
  f: Pick<FileDoc, 'status' | 'document_type' | 'current_level' | 'custom_route' | 'custom_stops'>
): string {
  const dtype = f.document_type ?? 'dlp';
  if (dtype === 'custom') {
    if (f.status === 'finalized') return 'Finalized';
    const stops = customStopsResolved(f);
    const cur = Number(f.current_level);
    if (f.status === 'uploaded' && stops.includes(cur)) {
      if (cur === 2) return 'With Coordinator';
      if (cur === 3) return 'With Master';
      if (cur === 4) return 'With Principal';
    }
    return 'In review';
  }
  if (dtype === 'examination') {
    switch (f.status) {
      case 'uploaded':
        return 'Awaiting Coordinator';
      case 'exam_principal':
        return 'With Principal';
      case 'exam_master':
        return 'With Master';
      case 'finalized':
        return 'Finalized';
      case 'returned':
        return 'Returned';
      default:
        return f.status;
    }
  }
  switch (f.status) {
    case 'uploaded':
      return Number(f.current_level) === 3 ? 'With Master' : 'Awaiting Coordinator';
    case 'reviewed_by_coordinator':
      return 'With Master';
    case 'reviewed_by_master':
      return 'With Principal';
    case 'finalized':
      return 'Finalized';
    case 'returned':
      return 'Returned';
    default:
      return f.status;
  }
}

/** Styling bucket for status chips (teacher home, file review, etc.). */
export function workflowStatusTone(
  f: Pick<FileDoc, 'status' | 'document_type' | 'current_level' | 'custom_route' | 'custom_stops'>
): 'pending' | 'in-review' | 'done' {
  if (f.status === 'finalized') return 'done';
  if (f.status === 'returned') return 'pending';
  if (f.status === 'uploaded') {
    const dtype = f.document_type ?? 'dlp';
    if (dtype === 'dlp' && Number(f.current_level) === 3) return 'in-review';
    if (dtype === 'custom') {
      const stops = customStopsResolved(f);
      const cur = Number(f.current_level);
      if (stops.includes(cur)) return 'in-review';
    }
    return 'pending';
  }
  return 'in-review';
}

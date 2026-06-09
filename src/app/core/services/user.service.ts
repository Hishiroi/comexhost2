import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AdminUserUpdatePayload,
  AuthUser,
  RoleLevel,
  SelfProfilePayload,
  UserPublicProfile,
} from '../models/auth.models';

export type ManagedUser = UserPublicProfile;

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  list(roleLevel?: RoleLevel): Observable<{ users: ManagedUser[] }> {
    let params = new HttpParams();
    if (roleLevel) params = params.set('role_level', String(roleLevel));
    return this.http.get<{ users: ManagedUser[] }>(this.base, { params });
  }

  getById(id: number): Observable<{ user: ManagedUser }> {
    return this.http.get<{ user: ManagedUser }>(`${this.base}/${id}`);
  }

  create(input: {
    name: string;
    email: string;
    password: string;
    role_level: RoleLevel;
    teacher_rank?: number | null;
  } & Partial<SelfProfilePayload>): Observable<{ user: ManagedUser }> {
    return this.http.post<{ user: ManagedUser }>(this.base, input);
  }

  update(id: number, body: AdminUserUpdatePayload): Observable<{ user: ManagedUser }> {
    return this.http.patch<{ user: ManagedUser }>(`${this.base}/${id}`, body);
  }

  delete(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }

  setActive(id: number, isActive: boolean): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.base}/${id}/active`, {
      is_active: isActive,
    });
  }

  getMyProfile(): Observable<{ user: ManagedUser }> {
    return this.http.get<{ user: ManagedUser }>(`${this.base}/me/profile`);
  }

  patchMyProfile(body: SelfProfilePayload | AdminUserUpdatePayload): Observable<{ user: ManagedUser }> {
    return this.http.patch<{ user: ManagedUser }>(`${this.base}/me/profile`, body);
  }
}

import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, NgOptimizedImage],
  templateUrl: './login.html',
  styleUrl: './login.css',
  host: { class: 'login-page' },
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  email = '';
  password = '';
  readonly submitting = signal(false);
  readonly errorMessage = signal('');
  readonly roleLabel = 'User';

  submit(): void {
    if (this.submitting()) return;
    const email = this.email.trim();
    const password = this.password;

    if (!email || !password) {
      this.errorMessage.set('Please enter both email and password.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    this.auth.login(email, password).subscribe({
      next: (res) => {
        this.submitting.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const target = returnUrl && returnUrl !== '/' ? returnUrl : res.redirect;
        void this.router.navigateByUrl(target || this.auth.defaultRoute());
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(this.describe(err));
      },
    });
  }

  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'Cannot reach the server. Please check your connection or try again later.';
      }
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      if (err.status === 401) return 'Invalid email or password.';
      if (err.status === 429) return 'Too many login attempts. Please try again later.';
      return `Login failed (HTTP ${err.status}).`;
    }
    return 'Login failed. Please try again.';
  }
}

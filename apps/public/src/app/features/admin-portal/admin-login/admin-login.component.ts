import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AdminStoreService } from '../../../core/services/admin-store.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <div class="logos-brand-box">
            <img
              src="/assets/images/logo-admin-experiencias.png"
              alt="Emblema Admin"
              class="login-emblem-img"
              referrerpolicy="no-referrer"
            />
            <div class="login-brand-text">
              <span class="brand-title">EXPERIENCIAS.CLUB</span>
              <span class="brand-tag">ADMINISTRACIÓN CENTRAL</span>
            </div>
          </div>

          <h1 class="login-title">Control de Operaciones y Socios</h1>
          <p class="login-sub">
            Ingreso exclusivo para administración de nóminas, lista de espera, vinculaciones de Google y conciliación de transferencias bancarias.
          </p>
        </div>

        <button
          type="button"
          class="submit-btn google-submit-btn"
          (click)="signInGoogle()"
          [disabled]="connectingGoogle()"
        >
          <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          {{ connectingGoogle() ? 'Conectando con Google...' : 'Iniciar sesión con Google (Admin)' }}
        </button>

        @if (errorMessage()) {
          <div class="alert-error">
            <mat-icon>error_outline</mat-icon>
            <span>{{ errorMessage() }}</span>
          </div>
        }

        <div class="divider">
          <span>O ACCESO DIRECTO DE DESARROLLO</span>
        </div>

        <button type="button" class="quick-admin-btn" (click)="quickLogin()">
          <mat-icon>verified_user</mat-icon>
          <div class="quick-admin-info">
            <strong>Ingresar como Superadmin</strong>
            <span>gonzagramaglia&#64;gmail.com</span>
          </div>
          <span class="quick-badge">Acceder</span>
        </button>

        <div class="admin-perks-box">
          <div class="perk-item">
            <mat-icon>check_circle</mat-icon>
            <span>Nómina completa unificada: socios oficiales y lista de espera</span>
          </div>
          <div class="perk-item">
            <mat-icon>check_circle</mat-icon>
            <span>Cuentas con Google vinculado marcadas como convertidas</span>
          </div>
          <div class="perk-item">
            <mat-icon>check_circle</mat-icon>
            <span>Revisión y validación de todos los comprobantes de pago enviados</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: calc(100dvh - 160px);
        padding: 2rem 1rem;
        box-sizing: border-box;
      }

      .login-card {
        width: 100%;
        max-width: 480px;
        background: rgba(22, 12, 6, 0.88);
        border: 1px solid rgba(255, 95, 0, 0.45);
        border-radius: 3px;
        padding: 2.25rem;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65), 0 0 25px rgba(255, 95, 0, 0.12);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }

      .login-header {
        text-align: center;
        margin-bottom: 2rem;
      }

      .logos-brand-box {
        display: inline-flex;
        align-items: center;
        gap: 0.85rem;
        margin-bottom: 1.25rem;
      }

      .login-emblem-img {
        width: 48px;
        height: 48px;
        object-fit: contain;
      }

      .login-brand-text {
        display: flex;
        flex-direction: column;
        text-align: left;
      }

      .brand-title {
        font-size: 1.05rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #ffffff;
      }

      .brand-tag {
        font-size: 0.68rem;
        font-weight: 800;
        color: #ff5f00;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .login-title {
        font-size: 1.45rem;
        font-weight: 700;
        color: #ffffff;
        margin: 0 0 0.6rem;
        letter-spacing: -0.01em;
      }

      .login-sub {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.72);
        line-height: 1.45;
        margin: 0;
      }

      .submit-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 0.85rem 1.25rem;
        font-size: 0.92rem;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
      }

      .google-submit-btn {
        background: #ffffff;
        color: #0b0704;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25);
      }

      .google-submit-btn:hover:not(:disabled) {
        background: #f1f1f1;
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      }

      .google-submit-btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }

      .google-icon {
        display: block;
        flex-shrink: 0;
      }

      .alert-error {
        margin-top: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid rgba(239, 68, 68, 0.45);
        color: #fca5a5;
        padding: 0.75rem 1rem;
        border-radius: 2px;
        font-size: 0.82rem;
      }

      .divider {
        display: flex;
        align-items: center;
        text-align: center;
        margin: 1.75rem 0 1.25rem;
        color: rgba(255, 255, 255, 0.45);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
      }

      .divider::before,
      .divider::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid rgba(255, 95, 0, 0.25);
      }

      .divider span {
        padding: 0 0.85rem;
      }

      .quick-admin-btn {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.85rem;
        background: rgba(255, 95, 0, 0.12);
        border: 1px solid rgba(255, 95, 0, 0.4);
        padding: 0.85rem 1rem;
        border-radius: 2px;
        color: #ffffff;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
      }

      .quick-admin-btn:hover {
        background: rgba(255, 95, 0, 0.22);
        border-color: #ff5f00;
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(255, 95, 0, 0.2);
      }

      .quick-admin-btn mat-icon {
        color: #ff5f00;
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .quick-admin-info {
        display: flex;
        flex-direction: column;
        flex: 1;
      }

      .quick-admin-info strong {
        font-size: 0.88rem;
        color: #ffffff;
      }

      .quick-admin-info span {
        font-size: 0.75rem;
        color: #ffaa73;
        font-family: var(--font-mono, monospace);
      }

      .quick-badge {
        padding: 0.3rem 0.6rem;
        background: #ff5f00;
        color: #0b0704;
        font-size: 0.72rem;
        font-weight: 800;
        border-radius: 1px;
        text-transform: uppercase;
      }

      .admin-perks-box {
        margin-top: 1.75rem;
        padding-top: 1.25rem;
        border-top: 1px solid rgba(255, 95, 0, 0.2);
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }

      .perk-item {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.75);
      }

      .perk-item mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: #ff5f00;
        margin-top: 1px;
        flex-shrink: 0;
      }
    `,
  ],
})
export class AdminLoginComponent {
  private readonly store = inject(AdminStoreService);

  readonly connectingGoogle = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async signInGoogle(): Promise<void> {
    this.connectingGoogle.set(true);
    this.errorMessage.set(null);

    const res = await this.store.signInWithGoogle();
    if (!res.success) {
      this.errorMessage.set(res.error || 'No se pudo completar el inicio de sesión con Google.');
      this.connectingGoogle.set(false);
    }
  }

  quickLogin(): void {
    this.store.quickLogin();
  }
}


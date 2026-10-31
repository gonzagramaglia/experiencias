import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ProviderStoreService } from '../../../core/services/provider-store.service';

@Component({
  selector: 'app-provider-profile',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="profile-container">
      <div class="profile-head">
        <div>
          <span class="section-kicker">CUENTA Y FISCALIDAD</span>
          <h2 class="card-heading">Perfil del Prestador y Datos de Cobro</h2>
          <p class="card-subheading">
            Esta información se utiliza para las fichas técnicas de tus experiencias y las instrucciones de transferencia a los socios.
          </p>
        </div>
      </div>

      <div class="profile-card">
        <form [formGroup]="form" (ngSubmit)="onSave()" class="profile-form">
          <div class="form-section">
            <h3 class="section-title">
              Datos del Emprendimiento
            </h3>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Email Asociado a la Cuenta</label>
                <input
                  type="email"
                  [value]="store.currentProvider()?.email || 'prestador@experiencias.club'"
                  class="form-input text-muted"
                  readonly
                  disabled
                />
                <span class="field-hint">Email oficial vinculado a tu cuenta de prestador habilitado</span>
              </div>

              <div class="form-group">
                <label class="form-label">Nombre del Responsable / Guía</label>
                <input type="text" formControlName="name" class="form-input" />
              </div>

              <div class="form-group">
                <label class="form-label">Nombre Comercial o Agencia</label>
                <input type="text" formControlName="agency" class="form-input" />
              </div>

              <div class="form-group">
                <label class="form-label">CUIT o DNI</label>
                <input type="text" formControlName="cuitDni" class="form-input" />
              </div>

              <div class="form-group">
                <label class="form-label">Teléfono / WhatsApp de Guardia</label>
                <input type="text" formControlName="phone" class="form-input" />
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">
              Datos Bancarios para Transferencias de Socios
            </h3>
            <p class="section-desc">
              Es la cuenta donde los socios transferirán el valor de sus inscripciones para que luego valides el comprobante.
            </p>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">CBU o Alias de Destino</label>
                <input type="text" formControlName="cbuAlias" class="form-input text-mono" />
              </div>

              <div class="form-group">
                <label class="form-label">Entidad Bancaria o Billetera</label>
                <input type="text" formControlName="bankName" class="form-input" />
              </div>
            </div>
          </div>

          @if (savedSuccess()) {
            <div class="alert-success">
              <span>¡Datos actualizados correctamente!</span>
            </div>
          }

          <div class="form-actions-split">
            <button type="button" class="btn-logout" (click)="onLogout()">
              Cerrar Sesión
            </button>
            <button type="submit" class="cta-save-btn" [disabled]="form.invalid">
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .profile-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .section-kicker {
      font-size: 0.72rem;
      font-weight: 700;
      color: #80b3ff;
      letter-spacing: 0.08em;
    }
    .card-heading {
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
      margin: 0.2rem 0;
    }
    .card-subheading {
      font-size: 0.88rem;
      color: rgba(255, 255, 255, 0.7);
      margin: 0;
    }
    .profile-card {
      background: rgba(22, 33, 85, 0.55);
      border: 1px solid rgba(128, 179, 255, 0.35);
      border-radius: 2px;
      padding: 2rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    .profile-form {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .form-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      border-bottom: 1px solid rgba(128, 179, 255, 0.15);
      padding-bottom: 1.75rem;
    }
    .form-section:last-of-type {
      border-bottom: none;
      padding-bottom: 0;
    }
    .section-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #80b3ff;
      margin: 0;
    }
    .section-desc {
      font-size: 0.82rem;
      color: rgba(255, 255, 255, 0.65);
      margin: 0;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
    }
    @media (max-width: 600px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .form-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.8);
    }
    .form-input {
      background: rgba(7, 13, 28, 0.6);
      border: 1px solid rgba(128, 179, 255, 0.25);
      border-radius: 2px;
      padding: 0.75rem 0.9rem;
      color: #ffffff;
      font-size: 0.9rem;
    }
    .form-input:focus {
      outline: none;
      border-color: #80b3ff;
    }
    .text-mono {
      font-family: var(--font-mono, monospace);
      letter-spacing: 0.05em;
    }
    .alert-success {
      display: flex;
      align-items: center;
      padding: 0.85rem 1rem;
      background: rgba(128, 179, 255, 0.12);
      border: 1px solid rgba(128, 179, 255, 0.4);
      border-radius: 2px;
      color: #80b3ff;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .field-hint {
      font-size: 0.72rem;
      color: rgba(128, 179, 255, 0.7);
    }
    .text-muted {
      opacity: 0.75;
      cursor: not-allowed;
      background: rgba(7, 13, 28, 0.85);
    }
    .form-actions-split {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding-top: 0.5rem;
    }
    .btn-logout {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.85rem 1.75rem;
      background: transparent;
      border: 1.5px solid #0d1e44;
      color: #80b3ff;
      font-weight: 700;
      font-size: 0.95rem;
      border-radius: 2px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-logout:hover {
      background: rgba(13, 30, 68, 0.35);
      border-color: #80b3ff;
      color: #ffffff;
    }
    .cta-save-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.85rem 1.75rem;
      background: #80b3ff;
      color: #070d18;
      font-weight: 700;
      font-size: 0.95rem;
      border-radius: 2px;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .cta-save-btn:hover:not(:disabled) {
      background: #a6c8ff;
    }
    .cta-save-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class ProviderProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly store = inject(ProviderStoreService);

  readonly savedSuccess = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: [this.store.currentProvider()?.name || '', Validators.required],
    agency: [this.store.currentProvider()?.agency || '', Validators.required],
    cuitDni: [this.store.currentProvider()?.cuitDni || '', Validators.required],
    phone: [this.store.currentProvider()?.phone || '', Validators.required],
    cbuAlias: [this.store.currentProvider()?.cbuAlias || '', Validators.required],
    bankName: [this.store.currentProvider()?.bankName || '', Validators.required],
  });

  onSave(): void {
    if (this.form.invalid) return;
    this.store.updateProfile(this.form.getRawValue());
    this.savedSuccess.set(true);
    setTimeout(() => this.savedSuccess.set(false), 3000);
  }

  onLogout(): void {
    this.store.logout();
    this.router.navigate(['/prestadores/dashboard']);
  }
}

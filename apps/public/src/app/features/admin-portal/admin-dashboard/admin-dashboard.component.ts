import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AdminStoreService, AdminMember, AdminApplication } from '../../../core/services/admin-store.service';
import { TransferSubmission } from '../../../core/models/bank-transfer.model';
import { ArsPipe, FechaPipe } from '../../../shared/pipes/format.pipes';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, ArsPipe, FechaPipe],
  template: `
    <div class="dash-container">
      <!-- Welcome Header Sobrio y Minimalista -->
      <section class="welcome-card">
        <div class="welcome-main">
          <div class="avatar-ring">
            <img
              src="/assets/images/gonza.jpg"
              [alt]="admin()?.name || 'Gonzalo Gramaglia'"
              class="admin-avatar"
              referrerpolicy="no-referrer"
            />
          </div>
          <div class="welcome-text">
            <div class="welcome-tag">
              <span>ADMINISTRACIÓN CENTRAL</span>
            </div>
            <h1 class="welcome-name">Hola, {{ admin()?.name || 'Gonzalo Gramaglia' }}</h1>
            <p class="welcome-agency">
              {{ admin()?.email || 'gonzagramaglia@gmail.com' }}
            </p>
          </div>
        </div>
      </section>

      <!-- KPI Metrics Grid - 4 Boxes rectangulares sobrias como prestadores -->
      <section class="metrics-grid">
        <!-- 1. Lista de Espera -->
        <div class="metric-card">
          <div class="metric-content">
            <span class="metric-label">Lista de Espera</span>
            <strong class="metric-value">{{ stats().totalWaitlist }}</strong>
            <span class="metric-hint">Prospectos registrados</span>
          </div>
        </div>

        <!-- 2. Socios (con cuenta vinculada a Google) -->
        <div class="metric-card">
          <div class="metric-content">
            <span class="metric-label">Socios</span>
            <strong class="metric-value">{{ stats().totalGoogleLinked }}</strong>
            <span class="metric-hint">Con cuenta vinculada a Google</span>
          </div>
        </div>

        <!-- 3. Clientes (Socios que ya pagaron) -->
        <div class="metric-card">
          <div class="metric-content">
            <span class="metric-label">Clientes</span>
            <strong class="metric-value">{{ stats().totalConverted }}</strong>
            <span class="metric-hint">Socios que ya pagaron</span>
          </div>
        </div>

        <!-- 4. Total Recaudado -->
        <div class="metric-card">
          <div class="metric-content">
            <span class="metric-label">Total Recaudado</span>
            <strong class="metric-value">{{ stats().confirmedRevenue | ars }}</strong>
            <span class="metric-hint">{{ stats().approvedReceiptsCount }} pagos acreditados</span>
          </div>
        </div>
      </section>

      <!-- Sección 1: Nómina Reciente de Socios y Waitlist -->
      <section class="dash-card">
        <div class="card-head">
          <h2 class="card-title">Últimos Socios Registrados</h2>
          <a routerLink="/socios" class="view-all-link">
            <span>Ver nómina completa ({{ stats().totalRecords }})</span>
          </a>
        </div>

        @if (recentMembers().length === 0) {
          <p class="empty-text">No hay miembros registrados todavía.</p>
        } @else {
          <div class="table-wrap">
            <table class="dash-data-table">
              <thead>
                <tr>
                  <th># Socio</th>
                  <th>Titular</th>
                  <th>Email</th>
                  <th>Membresía</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                @for (m of recentMembers(); track m.id) {
                  <tr>
                    <td>
                      @if (m.type === 'socio') {
                        <span class="badge-socio-num">#{{ m.position }}</span>
                      } @else {
                        <span class="badge-waitlist">Waitlist</span>
                      }
                    </td>
                    <td>
                      <strong class="row-name">{{ m.fullName || '—' }}</strong>
                    </td>
                    <td>
                      <span class="email-link">{{ m.email }}</span>
                    </td>
                    <td>
                      <span class="tier-pill" [attr.data-tier]="m.membershipTier">
                        {{ m.membershipTier | uppercase }}
                      </span>
                    </td>
                    <td>
                      <div class="tags-row">
                        @if (m.googleLinked) {
                          <span class="pill-google" title="Google Vinculado">Google</span>
                        }
                        @if (m.converted) {
                          <span class="pill-converted" title="Pagó al menos una experiencia">Pago OK</span>
                        } @else {
                          <span class="row-sub">Sin pago</span>
                        }
                      </div>
                    </td>
                    <td>
                      <span class="row-date">{{ m.createdAt | fecha: 'corta' }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <!-- Sección 2: Conciliación de Pagos y Comprobantes Recientes -->
      <section class="dash-card">
        <div class="card-head">
          <h2 class="card-title">Últimos Comprobantes Recibidos</h2>
          <a routerLink="/comprobantes" class="view-all-link">
            <span>Ver todos los comprobantes ({{ stats().totalSubmissions }})</span>
          </a>
        </div>

        @if (recentSubmissions().length === 0) {
          <p class="empty-text">No hay comprobantes enviados recientemente.</p>
        } @else {
          <div class="table-wrap">
            <table class="dash-data-table">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Socio</th>
                  <th>Experiencia</th>
                  <th>Fecha Salida</th>
                  <th>Cupos</th>
                  <th>Importe</th>
                  <th class="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                @for (sub of recentSubmissions(); track sub.id) {
                  <tr [class.row-pending]="sub.status === 'pendiente'">
                    <td>
                      <span class="ref-tag font-mono">{{ sub.reference }}</span>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <strong class="row-name">{{ sub.fullName }}</strong>
                        <span class="row-sub">DNI: {{ sub.dni }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="exp-title-cell">{{ sub.experienceTitle }}</span>
                    </td>
                    <td>
                      <span class="row-date">{{ sub.date | fecha: 'corta' }}</span>
                    </td>
                    <td>
                      <span class="seats-badge">{{ sub.participants }} pers.</span>
                    </td>
                    <td>
                      <strong class="amount-cell">{{ sub.amountArs | ars }}</strong>
                    </td>
                    <td class="text-right">
                      <button type="button" class="btn-review" (click)="openReceipt(sub)">
                        Revisar
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <!-- Sección 3: Postulaciones Recientes (Prestadores & Socios Fundadores) -->
      <section class="dash-card">
        <div class="card-head">
          <h2 class="card-title">Últimas Postulaciones Recibidas</h2>
          <a routerLink="/postulaciones" class="view-all-link">
            <span>Ver todas las postulaciones ({{ store.applicationStats().total }})</span>
          </a>
        </div>

        @if (recentApplications().length === 0) {
          <p class="empty-text">No hay postulaciones registradas todavía.</p>
        } @else {
          <div class="table-wrap">
            <table class="dash-data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Postulante</th>
                  <th>Detalles</th>
                  <th>Fecha</th>
                  <th class="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                @for (app of recentApplications(); track app.id) {
                  <tr>
                    <td>
                      @if (app.type === 'prestador') {
                        <span class="badge-post-prestador">PRESTADOR</span>
                      } @else {
                        <span class="badge-post-fundador">SOCIO FUNDADOR</span>
                      }
                    </td>
                    <td>
                      <div class="cell-stack">
                        <strong class="row-name">{{ app.fullName }}</strong>
                        <span class="row-email font-mono">{{ app.email }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="exp-title-cell">
                        {{ app.type === 'prestador' ? formatCategory(app.category) : 'Cuadro Fundacional' }}
                      </span>
                    </td>
                    <td>
                      <span class="row-date">{{ app.createdAt | fecha: 'corta' }}</span>
                    </td>
                    <td class="text-right">
                      <button type="button" class="btn-review" (click)="openApplication(app)">
                        Revisar
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <!-- Modal Rápido de Revisión de Comprobante -->
      @if (selectedSubmission(); as sub) {
        <div class="modal-backdrop" (click)="closeReceipt()">
          <div class="quick-modal-card" (click)="$event.stopPropagation()">
            <div class="modal-img-col">
              <img [src]="sub.receipt.url" [alt]="'Comprobante de ' + sub.fullName" class="receipt-img-view" />
            </div>
            <div class="modal-info-col">
              <div class="modal-top">
                <div>
                  <span class="card-kicker">COMPROBANTE · {{ sub.reference }}</span>
                  <h3 class="modal-sub-name">{{ sub.fullName }}</h3>
                </div>
                <button type="button" class="modal-x" (click)="closeReceipt()">×</button>
              </div>

              <div class="amount-banner">
                <span class="amount-banner-lbl">Monto Transferido</span>
                <strong class="amount-banner-val">{{ sub.amountArs | ars }}</strong>
              </div>

              <dl class="modal-dl">
                <div><dt>DNI:</dt><dd>{{ sub.dni }}</dd></div>
                <div><dt>Email:</dt><dd>{{ sub.email }}</dd></div>
                <div><dt>Teléfono:</dt><dd>{{ sub.phone }}</dd></div>
                <div><dt>Experiencia:</dt><dd>{{ sub.experienceTitle }}</dd></div>
                <div><dt>Fecha:</dt><dd>{{ sub.date | fecha: 'larga' }}</dd></div>
                <div><dt>Cupos:</dt><dd>{{ sub.participants }}</dd></div>
                @if (sub.discountCode) {
                  <div><dt>Descuento:</dt><dd>{{ sub.discountCode }}</dd></div>
                }
              </dl>

              <p class="modal-status-text" [attr.data-status]="sub.status">
                Estado del comprobante: <strong>{{ sub.status | uppercase }}</strong>
              </p>

              <a [href]="sub.receipt.url" [download]="sub.receipt.fileName" target="_blank" rel="noopener" class="btn-download">
                Descargar Comprobante
              </a>
            </div>
          </div>
        </div>
      }

      <!-- Modal Rápido de Revisión de Postulación -->
      @if (selectedApplication(); as app) {
        <div class="modal-backdrop" (click)="closeApplication()">
          <div class="quick-modal-card app-quick-modal" (click)="$event.stopPropagation()">
            <div class="modal-info-col full-app-col">
              <div class="modal-top">
                <div>
                  <span class="card-kicker">
                    {{ app.type === 'prestador' ? 'POSTULACIÓN PRESTADOR' : 'POSTULACIÓN SOCIO FUNDADOR' }}
                  </span>
                  <h3 class="modal-sub-name">{{ app.fullName }}</h3>
                </div>
                <button type="button" class="modal-x" (click)="closeApplication()">×</button>
              </div>

              <dl class="modal-dl">
                <div><dt>Email:</dt><dd><a [href]="'mailto:' + app.email" class="modal-link">{{ app.email }}</a></dd></div>
                <div><dt>Teléfono:</dt><dd>{{ app.phone || '—' }}</dd></div>
                @if (app.type === 'prestador') {
                  <div><dt>Rubro:</dt><dd>{{ formatCategory(app.category) }}</dd></div>
                  <div><dt>Región:</dt><dd>{{ app.region || 'Catamarca' }}</dd></div>
                  @if (app.website) {
                    <div><dt>Web:</dt><dd><a [href]="app.website" target="_blank" rel="noopener" class="modal-link">{{ app.website }}</a></dd></div>
                  }
                } @else {
                  <div><dt>Categoría:</dt><dd>Padrón de Socios Fundadores</dd></div>
                }
                <div><dt>Fecha:</dt><dd>{{ app.createdAt | fecha: 'larga' }}</dd></div>
              </dl>

              <div class="app-desc-box">
                <span class="desc-heading">{{ app.type === 'prestador' ? 'Descripción de servicios y equipamiento:' : 'Carta de motivación:' }}</span>
                <p class="desc-content">{{ app.type === 'prestador' ? (app.description || 'Sin descripción adicional.') : (app.motivationLetter || 'Sin carta de motivación.') }}</p>
              </div>

              <div class="modal-actions-row">
                <button type="button" class="btn-close-dash" (click)="closeApplication()">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .dash-container {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding-top: 1.5rem;
      }

      /* Welcome Card */
      .welcome-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(26, 14, 8, 0.78);
        border: 1px solid rgba(255, 95, 0, 0.4);
        border-radius: 2px;
        padding: 1.75rem 2rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(14px);
        gap: 1.5rem;
        flex-wrap: wrap;
      }

      .welcome-main {
        display: flex;
        align-items: center;
        gap: 1.5rem;
      }

      .avatar-ring {
        position: relative;
        flex-shrink: 0;
      }

      .admin-avatar {
        width: 96px;
        height: 96px;
        border-radius: 4px;
        border: 2px solid #ff5f00;
        box-shadow: 0 4px 16px rgba(255, 95, 0, 0.35);
        object-fit: cover;
        display: block;
      }

      .welcome-text {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .welcome-tag {
        display: inline-flex;
        align-items: center;
        font-size: 0.72rem;
        font-weight: 700;
        color: #ff5f00;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .welcome-name {
        font-size: 1.6rem;
        font-weight: 700;
        color: #ffffff;
        margin: 0;
        letter-spacing: -0.02em;
      }

      .welcome-agency {
        font-size: 0.88rem;
        color: rgba(255, 255, 255, 0.75);
        margin: 0;
      }

      /* KPI Metrics Grid - 4 Boxes sobrias rectangulares */
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
      }

      @media (max-width: 992px) {
        .metrics-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 768px) {
        .welcome-main {
          gap: 1rem;
        }
        .admin-avatar {
          width: 76px;
          height: 76px;
        }
        .metrics-grid {
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 0.65rem;
        }
        .metric-card {
          padding: 0.85rem 0.75rem;
          min-height: auto;
        }
        .metric-label {
          font-size: 0.62rem;
        }
        .metric-value {
          font-size: 1.25rem;
          margin: 0.1rem 0;
        }
        .metric-hint {
          font-size: 0.62rem;
        }
      }

      .metric-card {
        display: flex;
        flex-direction: column;
        justify-content: center;
        background: rgba(22, 12, 6, 0.85);
        border: 1px solid rgba(255, 95, 0, 0.32);
        border-radius: 2px;
        padding: 1.35rem 1.25rem;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(14px);
        min-height: 110px;
        box-sizing: border-box;
      }

      .metric-content {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .metric-label {
        display: block;
        font-size: 0.72rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.65);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        line-height: 1.2;
      }

      .metric-value {
        display: block;
        font-size: 1.75rem;
        font-weight: 800;
        color: #ffffff;
        line-height: 1.15;
        margin: 0.15rem 0;
        letter-spacing: -0.02em;
      }

      .metric-hint {
        display: block;
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.5);
        line-height: 1.2;
      }

      .text-orange { color: #ff5f00 !important; }
      .text-blue { color: #60a5fa !important; }
      .text-green { color: #34d399 !important; }

      /* Section Cards */
      .dash-card {
        background: rgba(22, 12, 6, 0.85);
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }

      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
      }

      .card-kicker {
        display: block;
        font-size: 0.68rem;
        font-weight: 800;
        color: #ff5f00;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 0.2rem;
      }

      .card-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: #ffffff;
        margin: 0;
      }

      .view-all-link {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        color: #ff8533;
        text-decoration: none;
        font-size: 0.82rem;
        font-weight: 700;
      }

      .view-all-link:hover {
        color: #ffaa73;
        text-decoration: underline;
      }

      .view-all-link mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .empty-text {
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.85rem;
        margin: 0;
      }

      /* Data Tables */
      .table-wrap {
        overflow-x: auto;
      }

      .dash-data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.82rem;
        text-align: left;
      }

      .dash-data-table th {
        background: rgba(35, 18, 10, 0.8);
        padding: 0.75rem 0.85rem;
        font-size: 0.68rem;
        font-weight: 800;
        color: #ff8533;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-bottom: 1px solid rgba(255, 95, 0, 0.25);
        white-space: nowrap;
      }

      .dash-data-table td {
        padding: 0.75rem 0.85rem;
        border-bottom: 1px solid rgba(255, 95, 0, 0.12);
        color: rgba(255, 255, 255, 0.85);
        vertical-align: middle;
      }

      .dash-data-table tbody tr:hover {
        background: rgba(255, 95, 0, 0.06);
      }

      .dash-data-table tbody tr.row-pending {
        background: rgba(255, 95, 0, 0.04);
      }

      .badge-socio-num {
        display: inline-block;
        padding: 0.2rem 0.45rem;
        background: rgba(255, 95, 0, 0.18);
        border: 1px solid rgba(255, 95, 0, 0.45);
        color: #ffaa73;
        font-family: var(--font-mono, monospace);
        font-weight: 700;
        font-size: 0.75rem;
        border-radius: 2px;
      }

      .badge-waitlist {
        display: inline-block;
        padding: 0.15rem 0.45rem;
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.75);
        font-size: 0.68rem;
        font-weight: 700;
        border-radius: 2px;
        text-transform: uppercase;
      }

      .ref-tag {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        background: rgba(255, 95, 0, 0.15);
        border: 1px solid rgba(255, 95, 0, 0.35);
        color: #ffaa73;
        font-weight: 700;
        border-radius: 2px;
      }

      .cell-stack {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }

      .row-name {
        color: #ffffff;
      }

      .row-sub {
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.5);
      }

      .email-link {
        color: #ffffff !important;
        font-family: var(--font-mono, monospace);
        font-size: 0.75rem;
      }

      .exp-title-cell {
        color: #ffffff;
        font-weight: 500;
      }

      .seats-badge {
        padding: 0.15rem 0.45rem;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        font-size: 0.75rem;
        font-weight: 700;
      }

      .amount-cell {
        color: #ffffff;
      }

      .font-mono {
        font-family: var(--font-mono, monospace);
      }

      .tier-pill {
        display: inline-block;
        padding: 0.18rem 0.5rem;
        font-size: 0.65rem;
        font-weight: 700;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.25);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .tags-row {
        display: flex;
        gap: 0.25rem;
      }

      .pill-google {
        padding: 0.1rem 0.35rem;
        background: rgba(255, 255, 255, 0.15);
        color: #ffffff;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        border-radius: 2px;
      }

      .pill-converted {
        padding: 0.1rem 0.35rem;
        background: rgba(16, 185, 129, 0.2);
        color: #34d399;
        font-size: 0.65rem;
        font-weight: 800;
        border-radius: 2px;
      }

      .status-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        font-size: 0.68rem;
        font-weight: 800;
        border-radius: 2px;
      }

      .status-badge[data-status='aprobado'] { background: rgba(16, 185, 129, 0.2); color: #34d399; }
      .status-badge[data-status='pendiente'] { background: rgba(255, 95, 0, 0.2); color: #ff8533; }
      .status-badge[data-status='rechazado'] { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }

      .btn-review {
        padding: 0.35rem 0.75rem;
        background: rgba(255, 95, 0, 0.18);
        border: 1px solid #ff5f00;
        color: #ffffff;
        font-size: 0.75rem;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
      }

      .btn-review:hover {
        background: #ff5f00;
        color: #0b0704;
      }

      .row-date {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.6);
      }

      .text-right { text-align: right; }

      /* Modal Rápido */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(4, 2, 1, 0.88);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        z-index: 1000;
      }

      .quick-modal-card {
        display: grid;
        grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
        width: min(850px, 100%);
        max-height: min(650px, 90vh);
        background: #140b06;
        border: 1px solid rgba(255, 95, 0, 0.45);
        border-radius: 2px;
        overflow: hidden;
      }

      .modal-img-col {
        background: #080402;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
      }

      .receipt-img-view {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .modal-info-col {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        overflow-y: auto;
      }

      .modal-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .modal-sub-name {
        color: #ffffff;
        margin: 0;
        font-size: 1.25rem;
      }

      .modal-x {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 1.5rem;
        cursor: pointer;
      }

      .amount-banner {
        background: rgba(30, 16, 9, 0.8);
        border: 1px solid rgba(255, 95, 0, 0.35);
        padding: 0.75rem 1rem;
        border-radius: 2px;
        display: flex;
        flex-direction: column;
      }

      .amount-banner-lbl {
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.6);
        text-transform: uppercase;
      }

      .amount-banner-val {
        font-size: 1.5rem;
        color: #34d399;
        font-weight: 800;
      }

      .modal-dl {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        font-size: 0.78rem;
        margin: 0;
      }

      .modal-dl dt { color: rgba(255, 255, 255, 0.5); }
      .modal-dl dd { color: #ffffff; margin: 0; }

      .modal-quick-actions {
        display: flex;
        gap: 0.5rem;
      }

      .btn-modal-reject {
        flex: 1;
        padding: 0.65rem;
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid #ef4444;
        color: #fca5a5;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
      }

      .btn-modal-approve {
        flex: 1.5;
        padding: 0.65rem;
        background: #10b981;
        border: none;
        color: #0b0704;
        font-weight: 800;
        border-radius: 2px;
        cursor: pointer;
      }

      .modal-status-text {
        font-size: 0.8rem;
        font-weight: 700;
        color: #34d399;
        margin: 0;
      }

      .btn-download {
        display: inline-block;
        text-align: center;
        padding: 0.5rem;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        font-size: 0.75rem;
        text-decoration: none;
        border-radius: 2px;
      }

      .badge-post-prestador {
        display: inline-block;
        padding: 0.15rem 0.45rem;
        background: rgba(128, 179, 255, 0.18);
        border: 1px solid rgba(128, 179, 255, 0.45);
        color: #80b3ff;
        font-size: 0.65rem;
        font-weight: 800;
        border-radius: 2px;
      }

      .badge-post-fundador {
        display: inline-block;
        padding: 0.15rem 0.45rem;
        background: rgba(245, 158, 11, 0.2);
        border: 1px solid rgba(245, 158, 11, 0.45);
        color: #fbbf24;
        font-size: 0.65rem;
        font-weight: 800;
        border-radius: 2px;
      }

      .app-quick-modal {
        display: block;
        max-width: 600px;
        width: 100%;
      }

      .full-app-col {
        padding: 1.75rem;
      }

      .modal-link {
        color: #80b3ff;
        text-decoration: none;
      }

      .modal-link:hover {
        text-decoration: underline;
      }

      .app-desc-box {
        margin-top: 0.5rem;
        padding: 0.85rem 1rem;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }

      .desc-heading {
        font-size: 0.72rem;
        text-transform: uppercase;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.5);
      }

      .desc-content {
        margin: 0;
        font-size: 0.82rem;
        color: rgba(255, 255, 255, 0.9);
        white-space: pre-wrap;
        line-height: 1.45;
      }

      .modal-actions-row {
        display: flex;
        gap: 0.75rem;
        margin-top: 0.75rem;
      }

      .btn-wa-action {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.6rem 1rem;
        background: #25d366;
        color: #0b0704;
        font-weight: 800;
        font-size: 0.78rem;
        text-decoration: none;
        border-radius: 2px;
      }

      .btn-close-dash {
        padding: 0.6rem 1.25rem;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        font-weight: 700;
        font-size: 0.78rem;
        border-radius: 2px;
        cursor: pointer;
      }

      .btn-close-dash:hover {
        background: rgba(255, 255, 255, 0.15);
      }

      .status-pill {
        display: inline-block;
        padding: 0.15rem 0.45rem;
        border-radius: 2px;
        font-size: 0.68rem;
        font-weight: 700;
      }

      .status-pill[data-status='pendiente'] {
        color: #fbbf24;
        background: rgba(245, 158, 11, 0.15);
      }

      .status-pill[data-status='aprobado'] {
        color: #34d399;
        background: rgba(16, 185, 129, 0.15);
      }

      .status-pill[data-status='rechazado'] {
        color: #fca5a5;
        background: rgba(239, 68, 68, 0.15);
      }
    `,
  ],
})
export class AdminDashboardComponent {
  readonly store = inject(AdminStoreService);

  readonly admin = this.store.currentAdmin;
  readonly stats = this.store.stats;
  readonly selectedSubmission = signal<TransferSubmission | null>(null);
  readonly selectedApplication = signal<AdminApplication | null>(null);

  readonly recentMembers = computed(() => this.store.members().slice(0, 7));
  readonly recentSubmissions = computed(() => this.store.submissions().slice(0, 7));
  readonly recentApplications = computed(() => this.store.applications().slice(0, 5));

  refreshAll(): void {
    void this.store.loadAllMembers();
    void this.store.loadAllSubmissions();
    void this.store.loadAllApplications();
  }

  openReceipt(sub: TransferSubmission): void {
    this.selectedSubmission.set(sub);
  }

  closeReceipt(): void {
    this.selectedSubmission.set(null);
  }

  openApplication(app: AdminApplication): void {
    this.selectedApplication.set(app);
  }

  closeApplication(): void {
    this.selectedApplication.set(null);
  }

  formatCategory(category?: string): string {
    const map: Record<string, string> = {
      alojamiento: 'Alojamiento',
      gastronomia: 'Gastronomía',
      guias_actividades: 'Guías & Excursiones',
      transporte: 'Transporte & Transfers',
      bienestar: 'Bienestar',
      experiencias_culturales: 'Cultura & Talleres',
    };
    return category ? (map[category] ?? category) : 'General';
  }

  getWhatsappLink(phone?: string, name?: string): string {
    if (!phone) return '#';
    const cleanDigits = phone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Hola ${name || ''}, te contactamos desde el equipo de Experiencias Club respecto a tu postulación.`
    );
    return `https://wa.me/${cleanDigits}?text=${text}`;
  }

  async quickApprove(id: string): Promise<void> {
    await this.store.reviewSubmission(id, 'aprobado');
    this.closeReceipt();
  }

  async quickReject(id: string): Promise<void> {
    await this.store.reviewSubmission(id, 'rechazado', 'Comprobante observado por el administrador.');
    this.closeReceipt();
  }
}


import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminStoreService } from '../../../core/services/admin-store.service';
import { TransferSubmission, TransferStatus } from '../../../core/models/bank-transfer.model';
import { ArsPipe, FechaPipe } from '../../../shared/pipes/format.pipes';

type StatusFilter = TransferStatus | 'todos';

@Component({
  selector: 'app-admin-receipts',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ArsPipe, FechaPipe],
  template: `
    <div class="receipts-container">
      <div class="receipts-header">
        <div>
          <span class="section-kicker">CONCILIACIÓN BANCARIA Y COMPROBANTES</span>
          <h1 class="card-heading">Comprobantes de Pago Enviados</h1>
          <p class="card-subheading">
            Registro unificado de transferencias de reservas recibidas. Validá el CBU, comprobá el monto transferido y acreditá los cupos de las expediciones.
          </p>
        </div>
      </div>

      <!-- Resumen Métrico de Pagos: Día, Semana, Mes y Total -->
      <div class="summary-strip">
        <div class="summary-item">
          <span class="sum-label">Recaudación del Día</span>
          <strong class="sum-value text-green">{{ store.stats().revenueToday | ars }}</strong>
        </div>
        <div class="summary-item">
          <span class="sum-label">Recaudación de la Semana</span>
          <strong class="sum-value text-green">{{ store.stats().revenueThisWeek | ars }}</strong>
        </div>
        <div class="summary-item">
          <span class="sum-label">Recaudación del Mes</span>
          <strong class="sum-value text-green">{{ store.stats().revenueThisMonth | ars }}</strong>
        </div>
        <div class="summary-item">
          <span class="sum-label">Total Recaudado</span>
          <strong class="sum-value text-green">{{ store.stats().confirmedRevenue | ars }}</strong>
        </div>
      </div>

      <!-- Barra de Filtros y Búsqueda -->
      <div class="filters-bar">
        <div class="search-box">
          <mat-icon class="search-icon">search</mat-icon>
          <input
            type="text"
            class="search-input"
            placeholder="Buscar por socio, DNI, referencia o experiencia..."
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
          />
          @if (searchQuery()) {
            <button type="button" class="clear-search-btn" (click)="searchQuery.set('')">×</button>
          }
        </div>

        <div class="filter-tabs">
          <button
            type="button"
            class="filter-tab"
            [class.is-active]="statusFilter() === 'todos'"
            (click)="statusFilter.set('todos')"
          >
            Todos ({{ store.stats().totalSubmissions }})
          </button>
          <button
            type="button"
            class="filter-tab"
            [class.is-active]="statusFilter() === 'pendiente'"
            (click)="statusFilter.set('pendiente')"
          >
            Pendientes ({{ store.stats().pendingReceiptsCount }})
          </button>
          <button
            type="button"
            class="filter-tab"
            [class.is-active]="statusFilter() === 'aprobado'"
            (click)="statusFilter.set('aprobado')"
          >
            Aprobados ({{ store.stats().approvedReceiptsCount }})
          </button>
          <button
            type="button"
            class="filter-tab"
            [class.is-active]="statusFilter() === 'rechazado'"
            (click)="statusFilter.set('rechazado')"
          >
            Rechazados ({{ store.stats().rejectedReceiptsCount }})
          </button>
        </div>
      </div>

      <!-- Tabla de Comprobantes -->
      @if (filteredSubmissions().length === 0) {
        <div class="empty-box">
          <mat-icon>receipt_long</mat-icon>
          <h3>No hay comprobantes con los filtros seleccionados</h3>
          <p>Probá cambiando los criterios de búsqueda o seleccioná otra pestaña.</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="receipts-table">
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Socio / Titular</th>
                <th>Experiencia & Fecha</th>
                <th>Cupos</th>
                <th>Importe</th>
                <th>Comprobante</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              @for (sub of filteredSubmissions(); track sub.id) {
                <tr [class.row-pending]="sub.status === 'pendiente'">
                  <!-- Referencia -->
                  <td>
                    <span class="ref-badge font-mono">{{ sub.reference }}</span>
                  </td>

                  <!-- Socio -->
                  <td>
                    <div class="cell-stack">
                      <strong class="socio-name">{{ sub.fullName }}</strong>
                      <span class="socio-meta">DNI: {{ sub.dni }}</span>
                      <a [href]="'mailto:' + sub.email" class="socio-email">{{ sub.email }}</a>
                    </div>
                  </td>

                  <!-- Experiencia & Fecha -->
                  <td>
                    <div class="cell-stack">
                      <strong class="exp-title">{{ sub.experienceTitle }}</strong>
                      <span class="exp-date">{{ sub.date | fecha: 'larga' }}</span>
                    </div>
                  </td>

                  <!-- Cupos -->
                  <td>
                    <span class="seats-chip">{{ sub.participants }} pers.</span>
                  </td>

                  <!-- Importe -->
                  <td>
                    <div class="cell-stack">
                      <strong class="amount-val">{{ sub.amountArs | ars }}</strong>
                      @if (sub.discountCode) {
                        <span class="discount-meta">Desc: {{ sub.discountCode }} (-{{ sub.discountArs | ars }})</span>
                      }
                    </div>
                  </td>

                  <!-- Miniatura de comprobante -->
                  <td>
                    <button type="button" class="thumb-btn" (click)="openReceipt(sub)" title="Ver comprobante adjunto">
                      @if (isPdf(sub.receipt.mimeType)) {
                        <div class="pdf-thumb">
                          <mat-icon>picture_as_pdf</mat-icon>
                          <span>PDF</span>
                        </div>
                      } @else {
                        <img [src]="sub.receipt.url" [alt]="sub.receipt.fileName" class="receipt-thumb-img" />
                      }
                    </button>
                  </td>

                  <!-- Botón Acción -->
                  <td>
                    <button type="button" class="review-btn" (click)="openReceipt(sub)">
                      Revisar
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Acciones al pie de la tabla -->
        <div class="table-footer-actions">
          <button type="button" class="btn-footer-action" (click)="refresh()" [disabled]="store.isLoadingSubmissions()">
            {{ store.isLoadingSubmissions() ? 'Actualizando...' : 'Refrescar Comprobantes' }}
          </button>

          <button type="button" class="btn-footer-action" (click)="downloadReceiptsList()">
            Descargar Planilla
          </button>
        </div>
      }

      <!-- Modal de Revisión y Validación de Comprobante -->
      @if (selected(); as sub) {
        <div class="modal-backdrop" (click)="closeReceipt()">
          <div class="receipt-modal-card" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
            <!-- Columna Izquierda: Vista Previa del Archivo -->
            <div class="receipt-modal-preview">
              @if (isPdf(sub.receipt.mimeType)) {
                <div class="pdf-preview-box">
                  <mat-icon class="pdf-icon-big">picture_as_pdf</mat-icon>
                  <strong>{{ sub.receipt.fileName }}</strong>
                  <a [href]="sub.receipt.url" target="_blank" rel="noopener" class="open-pdf-btn">
                    <mat-icon>open_in_new</mat-icon>
                    <span>Abrir PDF en pestaña nueva</span>
                  </a>
                </div>
              } @else {
                <div class="img-preview-box">
                  <img [src]="sub.receipt.url" [alt]="'Comprobante de ' + sub.fullName" class="preview-img" />
                </div>
              }
            </div>

            <!-- Columna Derecha: Detalle y Acciones -->
            <div class="receipt-modal-details">
              <div class="modal-head">
                <div>
                  <span class="section-kicker">DETALLE DE COMPROBANTE</span>
                  <h2 class="modal-title font-mono">{{ sub.reference }}</h2>
                </div>
                <button type="button" class="modal-close-btn" (click)="closeReceipt()" aria-label="Cerrar">×</button>
              </div>

              <!-- Cuadro de Monto Esperado -->
              <div class="expected-amount-card">
                <span class="exp-lbl">Importe Transferido</span>
                <strong class="exp-val text-green">{{ sub.amountArs | ars }}</strong>
                <span class="exp-hint">Verificá que el comprobante adjunto coincida con este importe.</span>
              </div>

              <!-- Lista de Datos -->
              <dl class="meta-data-list">
                <div><dt>Titular:</dt><dd><strong>{{ sub.fullName }}</strong></dd></div>
                <div><dt>DNI:</dt><dd class="font-mono">{{ sub.dni }}</dd></div>
                <div><dt>Email:</dt><dd>{{ sub.email }}</dd></div>
                <div><dt>Teléfono:</dt><dd>{{ sub.phone }}</dd></div>
                <div><dt>Experiencia:</dt><dd>{{ sub.experienceTitle }}</dd></div>
                <div><dt>Fecha Salida:</dt><dd>{{ sub.date | fecha: 'larga' }}</dd></div>
                <div><dt>Cupos:</dt><dd>{{ sub.participants }} personas</dd></div>
                <div><dt>Enviado el:</dt><dd>{{ sub.submittedAt | fecha: 'corta' }}</dd></div>
                @if (sub.discountCode) {
                  <div><dt>Descuento:</dt><dd>{{ sub.discountCode }} (-{{ sub.discountArs | ars }})</dd></div>
                }
              </dl>

              <!-- Estado del Comprobante -->
              <div class="status-summary-box" [attr.data-status]="sub.status">
                <mat-icon>{{ sub.status === 'aprobado' ? 'verified' : (sub.status === 'rechazado' ? 'cancel' : 'schedule') }}</mat-icon>
                <div>
                  <strong>Pago {{ sub.status | uppercase }}</strong>
                  @if (sub.reviewedAt) {
                    <span> · {{ sub.reviewedAt | fecha: 'corta' }}</span>
                  }
                  @if (sub.rejectionReason) {
                    <p class="rej-text">{{ sub.rejectionReason }}</p>
                  }
                </div>
              </div>

              <!-- Descarga Directa -->
              <a [href]="sub.receipt.url" [download]="sub.receipt.fileName" target="_blank" rel="noopener" class="download-link-btn">
                <mat-icon>download</mat-icon>
                <span>Descargar archivo original ({{ sub.receipt.fileName }})</span>
              </a>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .receipts-container {
        display: flex;
        flex-direction: column;
        gap: 1.15rem;
        margin-top: 0;
        padding-top: 0;
      }

      .top-nav-bar {
        display: flex;
        align-items: center;
      }

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        color: rgba(255, 255, 255, 0.75);
        font-size: 0.82rem;
        font-weight: 600;
        text-decoration: none;
        transition: all 0.2s ease;
      }

      .back-link:hover {
        color: #ff5f00;
      }

      .back-link mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .receipts-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1.5rem;
        flex-wrap: wrap;
      }

      .section-kicker {
        display: inline-block;
        font-size: 0.72rem;
        font-weight: 800;
        color: #ff5f00;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        margin: 0 0 0.15rem;
        line-height: 1;
      }

      .card-heading {
        font-size: 1.75rem;
        font-weight: 800;
        color: #ffffff;
        margin: 0 0 0.5rem;
        letter-spacing: -0.02em;
      }

      .card-subheading {
        font-size: 0.88rem;
        color: rgba(255, 255, 255, 0.75);
        margin: 0;
        max-width: 700px;
        line-height: 1.45;
      }

      .table-footer-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-top: -0.35rem;
        box-sizing: border-box;
      }

      .btn-footer-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.6rem 1.15rem;
        border-radius: 2px;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s ease, border-color 0.2s ease, filter 0.2s ease;
        background: rgba(30, 15, 8, 0.75);
        border: 1px solid rgba(255, 95, 0, 0.35);
        color: #ffffff;
      }

      .btn-footer-action:hover:not(:disabled) {
        background: rgba(45, 22, 12, 0.85);
        border-color: rgba(255, 95, 0, 0.5);
        filter: brightness(1.15);
      }

      .btn-footer-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .refresh-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 1.15rem;
        background: rgba(30, 16, 9, 0.85);
        border: 1px solid rgba(255, 95, 0, 0.4);
        color: #ffffff;
        border-radius: 2px;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .refresh-btn:hover:not(:disabled) {
        background: rgba(50, 25, 12, 0.95);
        border-color: #ff5f00;
      }

      .refresh-btn mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #ff5f00;
      }

      .refresh-btn mat-icon.spin {
        animation: spin 1s infinite linear;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* Summary Strip */
      .summary-strip {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
      }

      @media (max-width: 900px) {
        .summary-strip {
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 0.65rem;
        }
        .summary-item {
          padding: 0.85rem 0.75rem;
        }
        .sum-label {
          font-size: 0.62rem;
        }
        .sum-value {
          font-size: 1.25rem;
        }
        .sum-sub {
          font-size: 0.62rem;
        }
      }

      .summary-item {
        background: rgba(26, 14, 8, 0.78);
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
        padding: 1.15rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        backdrop-filter: blur(12px);
      }

      .sum-label {
        font-size: 0.72rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.65);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .sum-value {
        font-size: 1.85rem;
        font-weight: 800;
        color: #ffffff;
        line-height: 1.1;
      }

      .sum-sub {
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.5);
      }

      .text-orange { color: #ff5f00 !important; }
      .text-green { color: #34d399 !important; }

      /* Filters & Search */
      .filters-bar {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        background: rgba(22, 12, 6, 0.85);
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
        padding: 1rem;
      }

      .search-box {
        position: relative;
        display: flex;
        align-items: center;
      }

      .search-icon {
        position: absolute;
        left: 0.85rem;
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: #ff5f00;
      }

      .search-input {
        width: 100%;
        background: rgba(12, 6, 3, 0.9);
        border: 1px solid rgba(255, 95, 0, 0.35);
        color: #ffffff;
        font-size: 0.88rem;
        padding: 0.65rem 2.5rem 0.65rem 2.5rem;
        border-radius: 2px;
        outline: none;
        box-sizing: border-box;
      }

      .search-input:focus {
        border-color: #ff5f00;
        box-shadow: 0 0 10px rgba(255, 95, 0, 0.25);
      }

      .clear-search-btn {
        position: absolute;
        right: 0.85rem;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 1.25rem;
        cursor: pointer;
      }

      .filter-tabs {
        display: flex;
        gap: 0.45rem;
        flex-wrap: wrap;
      }

      .filter-tab {
        padding: 0.45rem 0.85rem;
        background: rgba(30, 16, 9, 0.6);
        border: 1px solid rgba(255, 95, 0, 0.25);
        color: rgba(255, 255, 255, 0.75);
        font-size: 0.78rem;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .filter-tab:hover {
        background: rgba(255, 95, 0, 0.15);
        color: #ffffff;
      }

      .filter-tab.is-active {
        background: #ff5f00;
        color: #0b0704;
        border-color: #ff5f00;
      }

      /* Receipts Table */
      .table-wrapper {
        background: rgba(20, 10, 5, 0.82);
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
        overflow-x: auto;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      }

      .receipts-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.82rem;
      }

      .receipts-table th {
        background: rgba(35, 18, 10, 0.95);
        padding: 0.85rem 1rem;
        font-size: 0.7rem;
        font-weight: 800;
        color: #ff8533;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-bottom: 1px solid rgba(255, 95, 0, 0.3);
        white-space: nowrap;
      }

      .receipts-table td {
        padding: 0.85rem 1rem;
        border-bottom: 1px solid rgba(255, 95, 0, 0.15);
        color: rgba(255, 255, 255, 0.85);
        vertical-align: middle;
      }

      .receipts-table tbody tr:hover {
        background: rgba(255, 95, 0, 0.08);
      }

      .receipts-table tbody tr.row-pending {
        background: rgba(255, 95, 0, 0.05);
      }

      .font-mono {
        font-family: var(--font-mono, monospace);
      }

      .ref-badge {
        display: inline-block;
        padding: 0.25rem 0.55rem;
        background: rgba(255, 95, 0, 0.18);
        border: 1px solid rgba(255, 95, 0, 0.45);
        color: #ffaa73;
        font-weight: 700;
        border-radius: 2px;
      }

      .cell-stack {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }

      .socio-name {
        color: #ffffff;
        font-size: 0.88rem;
      }

      .socio-meta {
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.6);
      }

      .socio-email {
        font-size: 0.72rem;
        color: #ffffff;
        text-decoration: none;
      }

      .socio-email:hover {
        text-decoration: underline;
      }

      .exp-title {
        color: #ffffff;
      }

      .exp-date {
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.6);
      }

      .seats-chip {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        font-weight: 700;
        font-size: 0.75rem;
      }

      .amount-val {
        font-size: 0.95rem;
        color: #ffffff;
      }

      .discount-meta {
        font-size: 0.7rem;
        color: #fbbf24;
      }

      .thumb-btn {
        background: transparent;
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
        padding: 2px;
        cursor: pointer;
        display: inline-flex;
        overflow: hidden;
      }

      .receipt-thumb-img {
        width: 44px;
        height: 44px;
        object-fit: cover;
        display: block;
      }

      .pdf-thumb {
        width: 44px;
        height: 44px;
        background: rgba(239, 68, 68, 0.2);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #fca5a5;
        font-size: 0.65rem;
        font-weight: 700;
      }

      .pdf-thumb mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.6rem;
        border-radius: 2px;
        font-size: 0.72rem;
        font-weight: 800;
      }

      .status-badge mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .status-badge[data-status='aprobado'] {
        background: rgba(16, 185, 129, 0.2);
        border: 1px solid #10b981;
        color: #34d399;
      }

      .status-badge[data-status='pendiente'] {
        background: rgba(255, 95, 0, 0.2);
        border: 1px solid #ff5f00;
        color: #ff8533;
      }

      .status-badge[data-status='rechazado'] {
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid #ef4444;
        color: #fca5a5;
      }

      .review-btn {
        padding: 0.4rem 0.85rem;
        background: rgba(255, 95, 0, 0.2);
        border: 1px solid #ff5f00;
        color: #ffffff;
        font-size: 0.78rem;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .review-btn:hover {
        background: #ff5f00;
        color: #0b0704;
      }

      /* Modal Backdrop & Card */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(5, 3, 2, 0.88);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        z-index: 1000;
      }

      .receipt-modal-card {
        display: grid;
        grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.2fr);
        width: min(960px, 100%);
        max-height: min(720px, 92vh);
        background: #140b06;
        border: 1px solid rgba(255, 95, 0, 0.45);
        border-radius: 3px;
        box-shadow: 0 25px 70px rgba(0, 0, 0, 0.7);
        overflow: hidden;
      }

      .receipt-modal-preview {
        background: #090503;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        overflow: auto;
      }

      .preview-img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .pdf-preview-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        text-align: center;
        color: #ffffff;
      }

      .pdf-icon-big {
        font-size: 64px;
        width: 64px;
        height: 64px;
        color: #ef4444;
      }

      .open-pdf-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 1rem;
        background: #ff5f00;
        color: #0b0704;
        text-decoration: none;
        font-weight: 700;
        font-size: 0.8rem;
        border-radius: 2px;
      }

      .receipt-modal-details {
        display: flex;
        flex-direction: column;
        padding: 1.75rem;
        overflow-y: auto;
        gap: 1.25rem;
      }

      .modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .modal-title {
        color: #ffffff;
        font-size: 1.4rem;
        margin: 0;
      }

      .modal-close-btn {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 1.75rem;
        cursor: pointer;
        line-height: 1;
      }

      .expected-amount-card {
        background: rgba(30, 16, 9, 0.85);
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }

      .exp-lbl {
        font-size: 0.72rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.65);
        text-transform: uppercase;
      }

      .exp-val {
        font-size: 1.75rem;
        font-weight: 800;
      }

      .exp-hint {
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.55);
      }

      .meta-data-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem 1rem;
        font-size: 0.82rem;
        margin: 0;
      }

      .meta-data-list dt {
        color: rgba(255, 255, 255, 0.5);
      }

      .meta-data-list dd {
        margin: 0;
        color: #ffffff;
      }

      .modal-actions-row {
        display: flex;
        gap: 0.75rem;
      }

      .btn-reject {
        flex: 1;
        padding: 0.75rem;
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid #ef4444;
        color: #fca5a5;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
      }

      .btn-reject:hover {
        background: rgba(239, 68, 68, 0.35);
      }

      .btn-approve {
        flex: 1.5;
        padding: 0.75rem;
        background: #10b981;
        border: 1px solid #10b981;
        color: #0b0704;
        font-weight: 800;
        border-radius: 2px;
        cursor: pointer;
      }

      .btn-approve:hover {
        background: #34d399;
      }

      .reject-box {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        background: rgba(30, 10, 8, 0.7);
        border: 1px solid rgba(239, 68, 68, 0.4);
        padding: 1rem;
        border-radius: 2px;
      }

      .reject-label {
        font-size: 0.78rem;
        font-weight: 700;
        color: #fca5a5;
      }

      .reject-textarea {
        background: #0d0604;
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #ffffff;
        font-size: 0.82rem;
        padding: 0.5rem;
        border-radius: 2px;
        outline: none;
      }

      .reject-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }

      .cancel-btn {
        padding: 0.5rem 0.85rem;
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #ffffff;
        font-size: 0.78rem;
        cursor: pointer;
        border-radius: 2px;
      }

      .confirm-reject-btn {
        padding: 0.5rem 0.85rem;
        background: #ef4444;
        border: none;
        color: #ffffff;
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
        border-radius: 2px;
      }

      .status-summary-box {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-radius: 2px;
      }

      .status-summary-box[data-status='aprobado'] {
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.4);
        color: #34d399;
      }

      .status-summary-box[data-status='rechazado'] {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #fca5a5;
      }

      .rej-text {
        font-size: 0.75rem;
        margin: 0.25rem 0 0;
      }

      .download-link-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.65rem;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        text-decoration: none;
        font-size: 0.78rem;
        font-weight: 600;
        border-radius: 2px;
      }

      .download-link-btn:hover {
        background: rgba(255, 255, 255, 0.16);
      }

      .empty-box {
        padding: 4rem 2rem;
        text-align: center;
        background: rgba(20, 10, 5, 0.85);
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
      }

      .empty-box mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: rgba(255, 95, 0, 0.5);
        margin-bottom: 0.5rem;
      }

      .empty-box h3 {
        color: #ffffff;
        margin: 0 0 0.5rem;
      }

      .empty-box p {
        color: rgba(255, 255, 255, 0.6);
        margin: 0;
      }

      @media (max-width: 768px) {
        .receipt-modal-card {
          grid-template-columns: 1fr;
        }
        .meta-data-list {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminReceiptsComponent {
  readonly store = inject(AdminStoreService);

  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<StatusFilter>('todos');
  readonly selected = signal<TransferSubmission | null>(null);
  readonly rejecting = signal<boolean>(false);
  readonly rejectionReason = signal<string>('');

  readonly filteredSubmissions = computed(() => {
    let list = this.store.submissions();
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();

    if (status !== 'todos') {
      list = list.filter((s) => s.status === status);
    }

    if (query) {
      list = list.filter((s) => {
        const nameMatch = s.fullName.toLowerCase().includes(query);
        const refMatch = s.reference.toLowerCase().includes(query);
        const dniMatch = s.dni.includes(query);
        const emailMatch = s.email.toLowerCase().includes(query);
        const expMatch = s.experienceTitle.toLowerCase().includes(query);
        return nameMatch || refMatch || dniMatch || emailMatch || expMatch;
      });
    }

    return list;
  });

  refresh(): void {
    void this.store.loadAllSubmissions();
  }

  downloadReceiptsList(): void {
    const list = this.store.submissions();
    const headers = ['Referencia', 'Socio', 'DNI', 'Email', 'Teléfono', 'Experiencia', 'Fecha Salida', 'Cupos', 'Importe', 'Descuento', 'Estado', 'Fecha Envío'];
    const escapeCsv = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = [
      headers.map(escapeCsv).join(','),
      ...list.map((s) => [
        escapeCsv(s.reference),
        escapeCsv(s.fullName),
        escapeCsv(s.dni),
        escapeCsv(s.email),
        escapeCsv(s.phone),
        escapeCsv(s.experienceTitle),
        escapeCsv(s.date),
        escapeCsv(s.participants),
        escapeCsv(s.amountArs),
        escapeCsv(s.discountCode || '—'),
        escapeCsv(s.status.toUpperCase()),
        escapeCsv(new Date(s.submittedAt).toLocaleDateString('es-AR')),
      ].join(',')),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comprobantes_reservas_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  openReceipt(sub: TransferSubmission): void {
    this.selected.set(sub);
    this.rejecting.set(false);
    this.rejectionReason.set('');
  }

  closeReceipt(): void {
    this.selected.set(null);
    this.rejecting.set(false);
  }

  async confirmApprove(id: string): Promise<void> {
    await this.store.reviewSubmission(id, 'aprobado');
    this.closeReceipt();
  }

  async confirmReject(id: string): Promise<void> {
    const reason = this.rejectionReason().trim();
    if (reason.length < 4) return;
    await this.store.reviewSubmission(id, 'rechazado', reason);
    this.closeReceipt();
  }

  isPdf(mimeType?: string): boolean {
    return mimeType === 'application/pdf';
  }
}


import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ProviderStoreService } from '../../../core/services/provider-store.service';
import { TransferSubmission } from '../../../core/models/bank-transfer.model';
import { ArsPipe, FechaPipe } from '../../../shared/pipes/format.pipes';

@Component({
  selector: 'app-provider-members',
  standalone: true,
  imports: [MatIconModule, ArsPipe, FechaPipe, FormsModule],
  template: `
    <div class="members-container">
      <div class="members-header">
        <div>
          <span class="section-kicker">GESTIÓN UNIFICADA</span>
          <h2 class="card-heading">Comprobantes y Socios Anotados</h2>
          <p class="card-subheading">
            Validá comprobantes de transferencia bancaria y consultá la nómina de exploradores
            inscriptos para tus experiencias.
          </p>
        </div>

        <button type="button" class="export-btn" (click)="copyRoster()">
          {{ copied() ? '¡Nómina Copiada!' : 'Copiar Planilla de Asistencia' }}
        </button>
      </div>

      <!-- Filters Bar - Rectangular -->
      <div class="filters-bar">
        <div class="search-box">
          <input
            type="text"
            class="search-input"
            placeholder="Buscar por socio, DNI, email o referencia..."
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
          />
        </div>

        <div class="filter-group">
          <label class="filter-label" for="filter-exp">Experiencia:</label>
          <select
            id="filter-exp"
            class="filter-select"
            [ngModel]="selectedExpId()"
            (ngModelChange)="selectedExpId.set($event)"
          >
            <option value="">Todas las experiencias</option>
            @for (exp of store.providerExperiences(); track exp.id) {
              <option [value]="exp.id">{{ exp.title }}</option>
            }
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label" for="filter-status">Estado de pago:</label>
          <select
            id="filter-status"
            class="filter-select"
            [ngModel]="selectedStatus()"
            (ngModelChange)="selectedStatus.set($event)"
          >
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes de revisión</option>
            <option value="aprobado">Aprobados / Confirmados</option>
            <option value="rechazado">Rechazados</option>
          </select>
        </div>
      </div>

      <!-- Stats Summary Strip - Rectangular -->
      <div class="summary-strip">
        <div class="summary-item">
          <span class="sum-label">Registros encontrados</span>
          <strong class="sum-value">{{ filteredMembers().length }}</strong>
        </div>
        <div class="summary-item">
          <span class="sum-label">Cupos Totales</span>
          <strong class="sum-value">{{ totalParticipants() }} personas</strong>
        </div>
        <div class="summary-item">
          <span class="sum-label">Monto Asociado</span>
          <strong class="sum-value text-blue">{{ totalAmount() | ars }}</strong>
        </div>
      </div>

      <!-- Members & Receipts Table - Rectangular sobrio -->
      @if (filteredMembers().length === 0) {
        <div class="empty-box">
          <h3>No se encontraron registros con esos criterios</h3>
          <p>Probá cambiando los filtros o la búsqueda.</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="members-table">
            <thead>
              <tr>
                <th>Socio / Titular</th>
                <th>Contacto</th>
                <th>Experiencia & Fecha</th>
                <th>Cupos</th>
                <th>Monto</th>
                <th>Comprobante</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (sub of filteredMembers(); track sub.id) {
                <tr [class.is-pending]="sub.status === 'pendiente'">
                  <td>
                    <div class="member-identity">
                      <strong>{{ sub.fullName }}</strong>
                      <span class="member-dni">DNI: {{ sub.dni }}</span>
                    </div>
                  </td>

                  <td>
                    <div class="member-contact">
                      <a [href]="'mailto:' + sub.email" class="contact-email">
                        {{ sub.email }}
                      </a>
                      <a
                        [href]="
                          getWhatsappLink(sub.phone, sub.fullName, sub.experienceTitle, sub.date)
                        "
                        target="_blank"
                        rel="noopener noreferrer"
                        class="contact-whatsapp"
                      >
                        WA: {{ sub.phone }}
                      </a>
                    </div>
                  </td>

                  <td>
                    <div class="exp-cell">
                      <span class="exp-cell-title">{{ sub.experienceTitle }}</span>
                      <span class="exp-cell-date">{{ sub.date | fecha }}</span>
                    </div>
                  </td>

                  <td>
                    <span class="cupo-badge"
                      >{{ sub.participants }}
                      {{ sub.participants === 1 ? 'persona' : 'personas' }}</span
                    >
                  </td>

                  <td>
                    <div class="amount-cell">
                      <strong>{{ sub.amountArs | ars }}</strong>
                      @if (sub.discountCode) {
                        <span class="discount-tag">{{ sub.discountCode }}</span>
                      }
                    </div>
                  </td>

                  <!-- Columna Comprobante: Ver comprobante abre el modal unificado -->
                  <td>
                    <button
                      type="button"
                      class="view-receipt-btn"
                      (click)="openReceipt(sub)"
                      title="Ver y validar comprobante bancario"
                    >
                      <mat-icon class="receipt-icon">receipt_long</mat-icon>
                      <span>Ver comprobante</span>
                    </button>
                  </td>

                  <td>
                    <span class="status-pill" [class]="'pill-' + sub.status">
                      @if (sub.status === 'aprobado') {
                        Confirmado
                      } @else if (sub.status === 'pendiente') {
                        Pendiente
                      } @else {
                        Rechazado
                      }
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Modal de Comprobantes Unificado -->
      @if (selectedSubmission(); as sub) {
        <div class="modal-backdrop" (click)="closeModal()">
          <div
            class="rc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rc-modal-title"
            (click)="$event.stopPropagation()"
          >
            <!-- Izquierda: Imagen o PDF del comprobante que rellena el espacio -->
            <div class="rc-modal-receipt">
              @if (isPdf(sub.receipt.mimeType)) {
                <a
                  [href]="sub.receipt.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rc-pdf-link"
                >
                  <mat-icon aria-hidden="true">picture_as_pdf</mat-icon>
                  Abrir PDF · {{ sub.receipt.fileName }}
                </a>
              } @else {
                <a
                  [href]="sub.receipt.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rc-receipt-link"
                  title="Clic para abrir en tamaño completo"
                >
                  <img
                    [src]="sub.receipt.url"
                    [alt]="'Comprobante de ' + sub.fullName"
                    class="rc-receipt-img"
                  />
                </a>
              }
            </div>

            <!-- Derecha: Datos y Acciones con RECHAZAR en mayúscula -->
            <div class="rc-modal-info">
              <div class="rc-modal-head">
                <div>
                  <span class="section-kicker"
                    >COMPROBANTE · <span class="pay-mono">{{ sub.reference }}</span></span
                  >
                  <h2 id="rc-modal-title" class="rc-modal-title">{{ sub.fullName }}</h2>
                </div>
                <button
                  type="button"
                  class="pay-close-btn"
                  (click)="closeModal()"
                  aria-label="Cerrar modal"
                >
                  <mat-icon aria-hidden="true">close</mat-icon>
                </button>
              </div>

              <div class="rc-check">
                <span class="pay-label">Monto esperado</span>
                <strong class="rc-check-amount">{{ sub.amountArs | ars }}</strong>
                <span class="rc-check-hint">
                  Verificá que el comprobante coincida con este monto y con el CBU:
                  {{ store.currentProvider()?.cbuAlias }}.
                </span>
              </div>

              <dl class="rc-details">
                <div>
                  <dt>Experiencia</dt>
                  <dd>{{ sub.experienceTitle }}</dd>
                </div>
                <div>
                  <dt>Fecha de Salida</dt>
                  <dd>{{ sub.date | fecha: 'larga' }}</dd>
                </div>
                <div>
                  <dt>Cupos Reservados</dt>
                  <dd>
                    {{ sub.participants }} {{ sub.participants === 1 ? 'persona' : 'personas' }}
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{{ sub.email }}</dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>{{ sub.phone }}</dd>
                </div>
                <div>
                  <dt>DNI</dt>
                  <dd class="pay-mono">{{ sub.dni }}</dd>
                </div>
                <div>
                  <dt>Fecha de Envío</dt>
                  <dd>{{ sub.submittedAt | fecha: 'hora' }}</dd>
                </div>
              </dl>

              @if (sub.status === 'pendiente') {
                @if (rejecting()) {
                  <div class="pay-field">
                    <label for="rc-reason" class="pay-label"
                      >Motivo del rechazo (se envía al socio):</label
                    >
                    <textarea
                      id="rc-reason"
                      class="pay-input"
                      rows="3"
                      [value]="rejectionReason()"
                      (input)="rejectionReason.set($any($event.target).value)"
                      placeholder="Ej: El monto transferido no coincide con el total de la reserva."
                    ></textarea>
                  </div>
                  <div class="rc-actions">
                    <button type="button" class="pay-secondary-btn" (click)="rejecting.set(false)">
                      Volver
                    </button>
                    <button
                      type="button"
                      class="rc-reject-btn"
                      [disabled]="rejectionReason().trim().length < 5"
                      (click)="confirmReject()"
                    >
                      CONFIRMAR RECHAZO
                    </button>
                  </div>
                } @else {
                  <div class="rc-actions">
                    <button
                      type="button"
                      class="pay-secondary-btn pay-reject-btn"
                      (click)="rejecting.set(true)"
                    >
                      RECHAZAR
                    </button>
                    <button type="button" class="cta-primary-btn" (click)="approveReceipt()">
                      Aprobar pago
                    </button>
                  </div>
                }
                <p class="pay-hint">
                  Al aprobar o rechazar, el estado del socio se actualiza inmediatamente.
                </p>
              } @else {
                <div class="rc-result" [attr.data-status]="sub.status">
                  <mat-icon aria-hidden="true">{{
                    sub.status === 'aprobado' ? 'check_circle' : 'cancel'
                  }}</mat-icon>
                  <div>
                    <strong>{{
                      sub.status === 'aprobado'
                        ? 'Pago aprobado y socio confirmado'
                        : 'Pago rechazado'
                    }}</strong>
                    @if (sub.reviewedAt) {
                      <span> · {{ sub.reviewedAt | fecha: 'hora' }}</span>
                    }
                    @if (sub.rejectionReason) {
                      <p>{{ sub.rejectionReason }}</p>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .members-container {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .members-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1.5rem;
        flex-wrap: wrap;
      }
      .section-kicker {
        font-size: 0.72rem;
        font-weight: 700;
        color: #80b3ff;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .card-heading {
        font-size: 1.45rem;
        font-weight: 700;
        color: #ffffff;
        margin: 0.25rem 0 0.35rem 0;
      }
      .card-subheading {
        font-size: 0.88rem;
        color: rgba(255, 255, 255, 0.75);
        margin: 0;
        max-width: 680px;
      }
      .export-btn {
        padding: 0.6rem 1.15rem;
        background: rgba(128, 179, 255, 0.15);
        border: 1px solid rgba(128, 179, 255, 0.35);
        border-radius: 2px;
        color: #80b3ff;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }
      .export-btn:hover {
        background: #80b3ff;
        color: #070d18;
      }
      .filters-bar {
        display: flex;
        gap: 1rem;
        align-items: center;
        flex-wrap: wrap;
        background: rgba(22, 33, 85, 0.55);
        border: 1px solid rgba(128, 179, 255, 0.25);
        border-radius: 2px;
        padding: 1rem 1.25rem;
        backdrop-filter: blur(14px);
      }
      .search-box {
        flex: 1 1 240px;
      }
      .search-input {
        width: 100%;
        background: rgba(7, 13, 28, 0.7);
        border: 1px solid rgba(128, 179, 255, 0.3);
        border-radius: 2px;
        padding: 0.55rem 0.85rem;
        color: #ffffff;
        font-size: 0.85rem;
        box-sizing: border-box;
      }
      .search-input:focus {
        outline: none;
        border-color: #80b3ff;
      }
      .filter-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .filter-label {
        font-size: 0.78rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.7);
        white-space: nowrap;
      }
      .filter-select {
        background: rgba(7, 13, 28, 0.7);
        border: 1px solid rgba(128, 179, 255, 0.3);
        border-radius: 2px;
        padding: 0.55rem 0.85rem;
        color: #ffffff;
        font-size: 0.82rem;
      }
      .filter-select:focus {
        outline: none;
        border-color: #80b3ff;
      }
      .summary-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
      }
      .summary-item {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        background: rgba(22, 33, 85, 0.55);
        border: 1px solid rgba(128, 179, 255, 0.25);
        border-radius: 2px;
        padding: 1rem 1.25rem;
        backdrop-filter: blur(14px);
      }
      .sum-label {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: rgba(255, 255, 255, 0.65);
        font-weight: 600;
      }
      .sum-value {
        font-size: 1.35rem;
        font-weight: 700;
        color: #ffffff;
      }
      .text-blue {
        color: #80b3ff !important;
      }
      .table-wrapper {
        background: rgba(22, 33, 85, 0.55);
        border: 1px solid rgba(128, 179, 255, 0.25);
        border-radius: 2px;
        overflow-x: auto;
        backdrop-filter: blur(14px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
      }
      .members-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.85rem;
      }
      .members-table th {
        background: rgba(7, 13, 28, 0.7);
        padding: 0.85rem 1rem;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #80b3ff;
        font-weight: 700;
        border-bottom: 1px solid rgba(128, 179, 255, 0.25);
      }
      .members-table td {
        padding: 1rem;
        border-bottom: 1px solid rgba(128, 179, 255, 0.12);
        vertical-align: middle;
        color: rgba(255, 255, 255, 0.85);
      }
      .members-table tr:hover {
        background: rgba(128, 179, 255, 0.06);
      }
      .members-table tr.is-pending {
        background: rgba(128, 179, 255, 0.04);
      }
      .member-identity {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .member-identity strong {
        color: #ffffff;
        font-size: 0.92rem;
      }
      .member-dni {
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.6);
        font-family: var(--font-mono, monospace);
      }
      .member-contact {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .contact-email {
        color: rgba(255, 255, 255, 0.85);
        text-decoration: none;
        font-size: 0.78rem;
      }
      .contact-email:hover {
        color: #80b3ff;
      }
      .contact-whatsapp {
        color: #80b3ff;
        text-decoration: none;
        font-size: 0.74rem;
        font-weight: 600;
      }
      .contact-whatsapp:hover {
        text-decoration: underline;
      }
      .exp-cell {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .exp-cell-title {
        font-weight: 600;
        color: #ffffff;
      }
      .exp-cell-date {
        font-size: 0.74rem;
        color: #80b3ff;
      }
      .cupo-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        background: rgba(128, 179, 255, 0.12);
        border: 1px solid rgba(128, 179, 255, 0.25);
        border-radius: 2px;
        font-size: 0.75rem;
        color: #ffffff;
        font-weight: 600;
      }
      .amount-cell {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .amount-cell strong {
        color: #80b3ff;
        font-family: var(--font-mono, monospace);
      }
      .discount-tag {
        font-size: 0.65rem;
        color: #ffaa55;
      }

      /* Botón Ver Comprobante */
      .view-receipt-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.4rem 0.75rem;
        background: rgba(128, 179, 255, 0.14);
        border: 1px solid rgba(128, 179, 255, 0.4);
        border-radius: 2px;
        color: #80b3ff;
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }
      .view-receipt-btn:hover {
        background: #80b3ff;
        color: #070d18;
        box-shadow: 0 2px 10px rgba(128, 179, 255, 0.35);
      }
      .receipt-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
      }

      .status-pill {
        display: inline-block;
        padding: 0.25rem 0.6rem;
        border-radius: 2px;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .pill-aprobado {
        background: rgba(128, 179, 255, 0.18);
        border: 1px solid rgba(128, 179, 255, 0.5);
        color: #80b3ff;
      }
      .pill-pendiente {
        background: rgba(128, 179, 255, 0.1);
        border: 1px solid rgba(128, 179, 255, 0.35);
        color: #80b3ff;
      }
      .pill-rechazado {
        background: rgba(255, 80, 80, 0.12);
        border: 1px solid rgba(255, 80, 80, 0.35);
        color: #ff8080;
      }

      /* Modal de comprobantes */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: rgba(6, 12, 28, 0.85);
        backdrop-filter: blur(10px);
      }
      .rc-modal {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 960px;
        max-height: calc(100vh - 3rem);
        overflow: auto;
        background: #0b1428;
        border: 1px solid rgba(128, 179, 255, 0.4);
        border-radius: 2px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.75);
        color: #ffffff;
      }
      @media (min-width: 820px) {
        .rc-modal {
          flex-direction: row;
        }
        .rc-modal-receipt {
          width: 48%;
          flex-shrink: 0;
        }
      }
      .rc-modal-receipt {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: rgba(14, 22, 54, 0.6);
        border-right: 1px solid rgba(128, 179, 255, 0.18);
      }
      .rc-receipt-link {
        display: block;
        width: 100%;
      }
      .rc-receipt-img {
        display: block;
        width: 100%;
        max-height: 70vh;
        object-fit: contain;
        border-radius: 2px;
        border: 1px solid rgba(128, 179, 255, 0.25);
      }
      .rc-pdf-link {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin: auto;
        padding: 1rem 1.25rem;
        border-radius: 2px;
        border: 1px solid #80b3ff;
        color: #80b3ff;
        background: rgba(128, 179, 255, 0.12);
        font-weight: 600;
        text-decoration: none;
      }
      .rc-modal-info {
        display: flex;
        flex-direction: column;
        gap: 1.15rem;
        padding: 1.75rem;
        flex: 1;
        min-width: 0;
      }
      .rc-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
      }
      .rc-modal-title {
        font-size: 1.35rem;
        font-weight: 700;
        margin: 0.25rem 0 0 0;
        color: #ffffff;
      }
      .pay-close-btn {
        background: transparent;
        border: 1px solid rgba(128, 179, 255, 0.3);
        color: #80b3ff;
        border-radius: 2px;
        padding: 0.35rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }
      .pay-close-btn:hover {
        background: rgba(128, 179, 255, 0.15);
        border-color: #80b3ff;
      }
      .rc-check {
        display: flex;
        flex-direction: column;
        padding: 1rem 1.25rem;
        border-radius: 2px;
        border: 1px solid rgba(128, 179, 255, 0.4);
        background: rgba(128, 179, 255, 0.08);
      }
      .rc-check-amount {
        font-size: 1.6rem;
        color: #80b3ff;
        font-family: var(--font-mono, monospace);
      }
      .rc-check-hint {
        font-size: 0.8rem;
        color: rgba(255, 255, 255, 0.7);
        margin-top: 0.25rem;
      }
      .rc-details {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        font-size: 0.88rem;
        margin: 0;
      }
      .rc-details > div {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        padding-bottom: 0.35rem;
        border-bottom: 1px dashed rgba(128, 179, 255, 0.15);
      }
      .rc-details dt {
        color: rgba(255, 255, 255, 0.65);
      }
      .rc-details dd {
        text-align: right;
        color: #ffffff;
        font-weight: 500;
        margin: 0;
      }
      .pay-mono {
        font-family: var(--font-mono, monospace);
      }
      .pay-field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .pay-label {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: rgba(255, 255, 255, 0.7);
      }
      .pay-input {
        width: 100%;
        background: rgba(7, 13, 28, 0.7);
        border: 1px solid rgba(128, 179, 255, 0.3);
        border-radius: 2px;
        padding: 0.65rem 0.85rem;
        color: #ffffff;
        font-size: 0.85rem;
        font-family: inherit;
        box-sizing: border-box;
        resize: vertical;
      }
      .pay-input:focus {
        outline: none;
        border-color: #80b3ff;
      }
      .rc-actions {
        display: flex;
        gap: 0.75rem;
      }
      .rc-actions > * {
        flex: 1;
      }
      .rc-reject-btn {
        padding: 0.85rem 1.2rem;
        background: #ef4444;
        color: #ffffff;
        font-weight: 700;
        border-radius: 2px;
        border: none;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        transition: opacity 0.2s;
      }
      .rc-reject-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .cta-primary-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.85rem 1.25rem;
        background: #80b3ff;
        color: #0b1533;
        font-weight: 700;
        border-radius: 2px;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .cta-primary-btn:hover {
        background: #9cc4ff;
      }
      .pay-secondary-btn {
        padding: 0.85rem 1.25rem;
        background: rgba(22, 33, 85, 0.65);
        border: 1px solid rgba(128, 179, 255, 0.35);
        color: #ffffff;
        border-radius: 2px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s ease;
      }
      .pay-secondary-btn:hover {
        border-color: #80b3ff;
        color: #80b3ff;
      }
      .pay-reject-btn {
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 700;
        border-color: rgba(255, 100, 100, 0.35);
        color: #ff9999;
      }
      .pay-reject-btn:hover {
        background: rgba(255, 80, 80, 0.15);
        border-color: #ff8080;
        color: #ff8080;
      }
      .pay-hint {
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.6);
        margin: 0;
      }
      .rc-result {
        display: flex;
        gap: 0.75rem;
        padding: 1rem;
        border-radius: 2px;
        border: 1px solid rgba(128, 179, 255, 0.35);
        background: rgba(22, 33, 85, 0.55);
        align-items: flex-start;
      }
      .rc-result[data-status='aprobado'] {
        border-color: #80b3ff;
      }
      .rc-result[data-status='aprobado'] mat-icon {
        color: #80b3ff;
      }
      .rc-result[data-status='rechazado'] {
        border-color: #ef4444;
      }
      .rc-result[data-status='rechazado'] mat-icon {
        color: #ef4444;
      }
      .rc-result strong {
        font-size: 0.92rem;
        color: #ffffff;
      }
      .rc-result p {
        margin-top: 0.25rem;
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.8);
      }
      .empty-box {
        text-align: center;
        padding: 3rem 1.5rem;
        background: rgba(22, 33, 85, 0.55);
        border: 1px solid rgba(128, 179, 255, 0.25);
        border-radius: 2px;
        backdrop-filter: blur(14px);
      }
      .empty-box h3 {
        font-size: 1.15rem;
        color: #ffffff;
        margin: 0 0 0.35rem 0;
      }
      .empty-box p {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.6);
        margin: 0;
      }
    `,
  ],
})
export class ProviderMembersComponent {
  readonly store = inject(ProviderStoreService);
  private readonly route = inject(ActivatedRoute);

  private readonly queryParams = toSignal(this.route.queryParams);

  readonly searchQuery = signal('');
  readonly selectedExpId = signal('');
  readonly selectedStatus = signal('todos');
  readonly copied = signal(false);

  // Modal de Comprobante
  readonly selectedSubmission = signal<TransferSubmission | null>(null);
  readonly rejecting = signal(false);
  readonly rejectionReason = signal('');

  constructor() {
    const qp = this.queryParams();
    if (qp?.['experiencia']) {
      this.selectedExpId.set(qp['experiencia']);
    }
    if (qp?.['ref']) {
      const match = this.store.providerSubmissions().find((s) => s.reference === qp['ref']);
      if (match) {
        this.selectedSubmission.set(match);
      }
    }
  }

  readonly filteredMembers = computed(() => {
    let list = this.store.providerSubmissions();
    const exp = this.selectedExpId();
    const status = this.selectedStatus();
    const query = this.searchQuery().trim().toLowerCase();

    if (exp) {
      list = list.filter((s) => s.experienceId === exp);
    }

    if (status !== 'todos') {
      list = list.filter((s) => s.status === status);
    }

    if (query) {
      list = list.filter(
        (s) =>
          s.fullName.toLowerCase().includes(query) ||
          s.email.toLowerCase().includes(query) ||
          s.dni.toLowerCase().includes(query) ||
          s.reference.toLowerCase().includes(query),
      );
    }

    return list;
  });

  readonly totalParticipants = computed(() =>
    this.filteredMembers().reduce((sum, item) => sum + item.participants, 0),
  );

  readonly totalAmount = computed(() =>
    this.filteredMembers().reduce((sum, item) => sum + item.amountArs, 0),
  );

  openReceipt(sub: TransferSubmission): void {
    this.selectedSubmission.set(sub);
    this.rejecting.set(false);
    this.rejectionReason.set('');
  }

  closeModal(): void {
    this.selectedSubmission.set(null);
    this.rejecting.set(false);
    this.rejectionReason.set('');
  }

  isPdf(mime?: string): boolean {
    return mime === 'application/pdf';
  }

  approveReceipt(): void {
    const sub = this.selectedSubmission();
    if (!sub) return;
    this.store.reviewSubmission(sub.id, 'aprobado');
    const updated = this.store.providerSubmissions().find((s) => s.id === sub.id) || null;
    this.selectedSubmission.set(updated);
  }

  confirmReject(): void {
    const sub = this.selectedSubmission();
    if (!sub) return;
    const reason = this.rejectionReason().trim();
    if (!reason) return;
    this.store.reviewSubmission(sub.id, 'rechazado', reason);
    const updated = this.store.providerSubmissions().find((s) => s.id === sub.id) || null;
    this.selectedSubmission.set(updated);
    this.rejecting.set(false);
  }

  getWhatsappLink(phone: string, name: string, experience: string, date: string): string {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    const message = encodeURIComponent(
      `Hola ${name}, te escribo desde la coordinación de la expedición "${experience}" para la salida del ${date}.`,
    );
    return `https://wa.me/${cleanPhone}?text=${message}`;
  }

  copyRoster(): void {
    const lines = [
      `PLANILLA DE ASISTENCIA Y COMPROBANTES - EXPERIENCIAS.CLUB`,
      `Fecha de generación: ${new Date().toLocaleDateString('es-AR')}`,
      `--------------------------------------------------`,
    ];

    for (const m of this.filteredMembers()) {
      lines.push(
        `${m.fullName} | DNI: ${m.dni} | ${m.participants} cupo(s) | ${m.experienceTitle} (${m.date}) | Comprobante: ${m.reference} | Tel: ${m.phone} | Estado: ${m.status.toUpperCase()}`,
      );
    }

    if (navigator?.clipboard) {
      navigator.clipboard.writeText(lines.join('\n'));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    }
  }
}

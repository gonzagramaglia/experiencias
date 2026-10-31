import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  AdminStoreService,
  AdminApplication,
  ApplicationType,
  ApplicationStatus,
} from '../../../core/services/admin-store.service';
import { FechaPipe } from '../../../shared/pipes/format.pipes';

type ApplicationFilterTab = 'todas' | 'prestadores' | 'fundadores' | 'pendientes' | 'aprobadas';

@Component({
  selector: 'app-admin-applications',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, FechaPipe],
  template: `
    <div class="applications-container">
      <div class="applications-header">
        <div>
          <span class="section-kicker">CONVOCATORIAS & POSTULACIONES</span>
          <h1 class="card-heading">Postulaciones del Club</h1>
          <p class="card-subheading">
            Padrón consolidado de solicitudes recibidas para sumarse como prestadores de servicios turísticos o miembros del cuadro de Socios Fundadores.
          </p>
        </div>
      </div>

      <!-- Resumen Métrico de Postulaciones (4 Boxes sobrias) -->
      <div class="summary-strip">
        <div class="summary-item">
          <span class="sum-label">Total Postulaciones</span>
          <strong class="sum-value">{{ store.applicationStats().total }}</strong>
          <span class="sum-sub">Solicitudes registradas</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Prestadores</span>
          <strong class="sum-value">{{ store.applicationStats().prestadoresCount }}</strong>
          <span class="sum-sub">Guías, 4x4, Náutica y Servicios</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Socios Fundadores</span>
          <strong class="sum-value">{{ store.applicationStats().fundadoresCount }}</strong>
          <span class="sum-sub">Aspirantes al padrón vitalicio</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Pendientes de Revisión</span>
          <strong class="sum-value">{{ store.applicationStats().pendientesCount }}</strong>
          <span class="sum-sub">Requieren evaluación</span>
        </div>
      </div>

      <!-- Barra de Filtros y Búsqueda -->
      <div class="filters-bar">
        <div class="search-box">
          <mat-icon class="search-icon">search</mat-icon>
          <input
            type="text"
            class="search-input"
            placeholder="Buscar por postulante, email, teléfono, rubro o región..."
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
            [class.is-active]="activeTab() === 'todas'"
            (click)="activeTab.set('todas')"
          >
            Todas ({{ store.applicationStats().total }})
          </button>

          <button
            type="button"
            class="filter-tab"
            [class.is-active]="activeTab() === 'prestadores'"
            (click)="activeTab.set('prestadores')"
          >
            Prestadores ({{ store.applicationStats().prestadoresCount }})
          </button>

          <button
            type="button"
            class="filter-tab"
            [class.is-active]="activeTab() === 'fundadores'"
            (click)="activeTab.set('fundadores')"
          >
            Socios Fundadores ({{ store.applicationStats().fundadoresCount }})
          </button>

          <button
            type="button"
            class="filter-tab"
            [class.is-active]="activeTab() === 'pendientes'"
            (click)="activeTab.set('pendientes')"
          >
            Pendientes ({{ store.applicationStats().pendientesCount }})
          </button>

          <button
            type="button"
            class="filter-tab"
            [class.is-active]="activeTab() === 'aprobadas'"
            (click)="activeTab.set('aprobadas')"
          >
            Aprobadas ({{ store.applicationStats().aprobadasCount }})
          </button>
        </div>
      </div>

      <!-- Tabla Principal de Postulaciones -->
      @if (filteredApplications().length === 0) {
        <div class="empty-box">
          <mat-icon>assignment_late</mat-icon>
          <h3>No se encontraron postulaciones</h3>
          <p>Probá cambiando la búsqueda o seleccionando otra pestaña de filtro.</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="applications-table">
            <thead>
              <tr>
                <th class="col-type">Tipo</th>
                <th class="col-postulante">Postulante</th>
                <th class="col-rubro">Detalles</th>
                <th class="col-fecha">Fecha</th>
                <th class="col-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (app of filteredApplications(); track app.id) {
                <tr [class.is-prestador]="app.type === 'prestador'" [class.is-fundador]="app.type === 'fundador'">
                  <!-- Tipo -->
                  <td>
                    @if (app.type === 'prestador') {
                      <span class="badge-type badge-prestador">PRESTADOR</span>
                    } @else {
                      <span class="badge-type badge-fundador">SOCIO FUNDADOR</span>
                    }
                  </td>

                  <!-- Postulante -->
                  <td>
                    <div class="postulante-cell">
                      <strong class="postulante-name">{{ app.fullName }}</strong>
                      <span class="postulante-email">{{ app.email }}</span>
                      @if (app.phone && app.phone !== '—') {
                        <a
                          [href]="getWhatsappLink(app.phone, app.fullName)"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="contact-whatsapp"
                          title="Contactar vía WhatsApp"
                        >
                          <span>{{ app.phone }}</span>
                        </a>
                      }
                    </div>
                  </td>

                  <!-- Rubro / Detalle -->
                  <td>
                    <div class="detail-cell">
                      @if (app.type === 'prestador') {
                        <strong class="rubro-title">{{ formatCategory(app.category) }}</strong>
                        <span class="rubro-sub">{{ app.region || 'Catamarca' }}</span>
                        @if (app.website) {
                          <a [href]="app.website" target="_blank" rel="noopener noreferrer" class="rubro-link">
                            {{ app.website }}
                          </a>
                        }
                      } @else {
                        <strong class="rubro-title">Cuadro Fundacional</strong>
                        <span class="rubro-snippet" [title]="app.motivationLetter">
                          {{ getSnippet(app.motivationLetter) }}
                        </span>
                      }
                    </div>
                  </td>

                  <!-- Fecha -->
                  <td>
                    <span class="date-text">{{ app.createdAt | fecha: 'corta' }}</span>
                  </td>

                  <!-- Acciones -->
                  <td>
                    <button
                      type="button"
                      class="btn-view"
                      (click)="openDetailModal(app)"
                      title="Ver postulación completa"
                    >
                      Ver Detalle
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Botones de Acción al Pie de la Tabla -->
        <div class="table-footer-actions">
          <button
            type="button"
            class="btn-footer-action"
            (click)="refresh()"
            [disabled]="store.isLoadingApplications()"
          >
            {{ store.isLoadingApplications() ? 'Actualizando...' : 'Refrescar Postulaciones' }}
          </button>

          <button
            type="button"
            class="btn-footer-action"
            (click)="downloadRoster()"
          >
            Descargar Planilla
          </button>
        </div>
      }

      <!-- Modal de Detalle de Postulación -->
      @if (selectedApp()) {
        <div class="modal-backdrop" (click)="closeDetailModal()">
          <div class="modal-dialog" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <div>
                <span class="modal-kicker">DETALLE DE POSTULACIÓN</span>
                <h2 class="modal-title">{{ selectedApp()!.fullName }}</h2>
              </div>
              <button type="button" class="modal-close-btn" (click)="closeDetailModal()">×</button>
            </div>

            <div class="modal-body">
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="dt-label">Tipo de Postulación</span>
                  <strong class="dt-value">
                    {{ selectedApp()!.type === 'prestador' ? 'Prestador de Servicios Turísticos' : 'Socio Fundador' }}
                  </strong>
                </div>

                <div class="detail-item">
                  <span class="dt-label">Estado Actual</span>
                  <span class="status-badge modal-badge" [attr.data-status]="selectedApp()!.status">
                    {{ selectedApp()!.status === 'aprobado' ? 'Aprobada' : selectedApp()!.status === 'rechazado' ? 'Rechazada' : 'Pendiente' }}
                  </span>
                </div>

                <div class="detail-item">
                  <span class="dt-label">Email de Contacto</span>
                  <a [href]="'mailto:' + selectedApp()!.email" class="dt-link">{{ selectedApp()!.email }}</a>
                </div>

                <div class="detail-item">
                  <span class="dt-label">Teléfono</span>
                  <span class="dt-value">{{ selectedApp()!.phone || '—' }}</span>
                </div>

                @if (selectedApp()!.type === 'prestador') {
                  <div class="detail-item">
                    <span class="dt-label">Rubro / Categoría</span>
                    <strong class="dt-value">{{ formatCategory(selectedApp()!.category) }}</strong>
                  </div>

                  <div class="detail-item">
                    <span class="dt-label">Región Operativa</span>
                    <span class="dt-value">{{ selectedApp()!.region || 'Catamarca' }}</span>
                  </div>

                  @if (selectedApp()!.website) {
                    <div class="detail-item full-span">
                      <span class="dt-label">Sitio Web / Redes</span>
                      <a [href]="selectedApp()!.website" target="_blank" rel="noopener" class="dt-link">
                        {{ selectedApp()!.website }}
                      </a>
                    </div>
                  }

                  <div class="detail-item full-span">
                    <span class="dt-label">Descripción de Servicios y Logística</span>
                    <p class="dt-text-box">{{ selectedApp()!.description || 'Sin descripción adicional.' }}</p>
                  </div>
                } @else {
                  <div class="detail-item full-span">
                    <span class="dt-label">Carta de Motivación para ser Socio Fundador</span>
                    <p class="dt-text-box">{{ selectedApp()!.motivationLetter || 'Sin carta de motivación provista.' }}</p>
                  </div>
                }

                <div class="detail-item full-span">
                  <span class="dt-label">Fecha de Postulación</span>
                  <span class="dt-sub">{{ selectedApp()!.createdAt | fecha: 'larga' }}</span>
                </div>
              </div>
            </div>

            <div class="modal-actions">
              <div class="state-buttons">
                @if (selectedApp()!.status !== 'aprobado') {
                  <button
                    type="button"
                    class="btn-state btn-approve"
                    (click)="changeStatus('aprobado')"
                  >
                    Aprobar Postulación
                  </button>
                }

                @if (selectedApp()!.status !== 'pendiente') {
                  <button
                    type="button"
                    class="btn-state btn-pending"
                    (click)="changeStatus('pendiente')"
                  >
                    Marcar Pendiente
                  </button>
                }
              </div>

              <button type="button" class="btn-close" (click)="closeDetailModal()">
                Cerrar
              </button>
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

      .applications-container {
        display: flex;
        flex-direction: column;
        gap: 1.15rem;
        margin-top: 0;
        padding-top: 0;
      }

      .applications-header {
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
        color: rgba(255, 255, 255, 0.65);
        max-width: 780px;
        margin: 0;
        line-height: 1.5;
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
      .text-amber { color: #f59e0b !important; }
      .text-blue { color: #80b3ff !important; }

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
        color: rgba(255, 255, 255, 0.4);
      }

      .search-input {
        width: 100%;
        background: rgba(12, 6, 3, 0.85);
        border: 1px solid rgba(255, 95, 0, 0.3);
        border-radius: 2px;
        padding: 0.65rem 2.5rem 0.65rem 2.5rem;
        color: #ffffff;
        font-size: 0.85rem;
        outline: none;
        transition: border-color 0.2s ease;
      }

      .search-input:focus {
        border-color: #ff5f00;
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

      /* Applications Table */
      .table-wrapper {
        background: rgba(20, 10, 5, 0.82);
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
        overflow-x: auto;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      }

      .applications-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.82rem;
      }

      .applications-table th {
        background: rgba(35, 18, 10, 0.95);
        padding: 0.85rem 1rem;
        font-size: 0.7rem;
        font-weight: 800;
        color: rgba(255, 255, 255, 0.65);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-bottom: 1px solid rgba(255, 95, 0, 0.35);
        white-space: nowrap;
      }

      .applications-table td {
        padding: 0.85rem 1rem;
        border-bottom: 1px solid rgba(255, 95, 0, 0.12);
        vertical-align: middle;
      }

      .applications-table tr:hover td {
        background: rgba(255, 95, 0, 0.04);
      }

      .badge-type {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        border-radius: 2px;
        white-space: nowrap;
      }

      .badge-prestador {
        background: rgba(128, 179, 255, 0.18);
        border: 1px solid rgba(128, 179, 255, 0.45);
        color: #80b3ff;
      }

      .badge-fundador {
        background: rgba(245, 158, 11, 0.18);
        border: 1px solid rgba(245, 158, 11, 0.45);
        color: #fbbf24;
      }

      .postulante-cell {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }

      .postulante-name {
        color: #ffffff;
        font-size: 0.88rem;
        font-weight: 700;
      }

      .postulante-email {
        color: #ffffff;
        font-family: var(--font-mono, monospace);
        font-size: 0.78rem;
      }

      .contact-whatsapp {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        color: rgba(255, 255, 255, 0.5);
        text-decoration: none;
        font-size: 0.75rem;
        font-family: var(--font-mono, monospace);
      }

      .contact-whatsapp:hover {
        color: rgba(255, 255, 255, 0.85);
        text-decoration: underline;
      }

      .detail-cell {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        max-width: 320px;
      }

      .rubro-title {
        color: #ffffff;
        font-size: 0.82rem;
      }

      .rubro-sub {
        color: #ffffff;
        font-size: 0.75rem;
      }

      .rubro-link {
        color: rgba(255, 255, 255, 0.55);
        font-size: 0.72rem;
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .rubro-link:hover {
        color: rgba(255, 255, 255, 0.85);
        text-decoration: underline;
      }

      .rubro-snippet {
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.74rem;
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .status-badge {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        font-size: 0.68rem;
        font-weight: 700;
        border-radius: 2px;
        white-space: nowrap;
      }

      .status-badge[data-status='pendiente'] {
        background: rgba(245, 158, 11, 0.18);
        border: 1px solid rgba(245, 158, 11, 0.45);
        color: #fbbf24;
      }

      .status-badge[data-status='aprobado'] {
        background: rgba(16, 185, 129, 0.2);
        border: 1px solid rgba(16, 185, 129, 0.45);
        color: #34d399;
      }

      .status-badge[data-status='rechazado'] {
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid rgba(239, 68, 68, 0.45);
        color: #fca5a5;
      }

      .date-text {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.6);
        white-space: nowrap;
      }

      .btn-view {
        padding: 0.35rem 0.75rem;
        background: rgba(255, 95, 0, 0.15);
        border: 1px solid rgba(255, 95, 0, 0.4);
        color: #ffffff;
        font-size: 0.75rem;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }

      .btn-view:hover {
        background: #ff5f00;
        color: #0b0704;
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

      /* Modal */
      .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.82);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1.5rem;
        animation: fadeIn 0.15s ease;
      }

      .modal-dialog {
        background: #140b06;
        border: 1px solid rgba(255, 95, 0, 0.5);
        border-radius: 2px;
        width: 600px;
        max-width: 95vw;
        max-height: 90vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9);
      }

      .modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid rgba(255, 95, 0, 0.3);
      }

      .modal-kicker {
        font-size: 0.68rem;
        font-weight: 800;
        color: #ff5f00;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .modal-title {
        color: #ffffff;
        font-size: 1.35rem;
        margin: 0.2rem 0 0;
      }

      .modal-close-btn {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0 0.35rem;
      }

      .modal-close-btn:hover {
        color: #ffffff;
      }

      .modal-body {
        padding: 1.5rem;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1.15rem;
      }

      @media (max-width: 600px) {
        .detail-grid {
          grid-template-columns: 1fr;
        }
      }

      .detail-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .detail-item.full-span {
        grid-column: 1 / -1;
      }

      .dt-label {
        font-size: 0.7rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.55);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .dt-value {
        color: #ffffff;
        font-size: 0.9rem;
      }

      .dt-sub {
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.8rem;
      }

      .dt-link {
        color: #ff8533;
        font-size: 0.85rem;
        text-decoration: none;
        word-break: break-all;
      }

      .dt-link:hover {
        text-decoration: underline;
      }

      .dt-phone-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: #ffffff;
        font-size: 0.88rem;
      }

      .dt-wa-btn {
        padding: 0.2rem 0.5rem;
        background: rgba(37, 211, 102, 0.2);
        border: 1px solid rgba(37, 211, 102, 0.5);
        color: #4ade80;
        font-size: 0.72rem;
        font-weight: 700;
        border-radius: 2px;
        text-decoration: none;
      }

      .dt-wa-btn:hover {
        background: rgba(37, 211, 102, 0.35);
      }

      .dt-text-box {
        background: rgba(8, 4, 2, 0.7);
        border: 1px solid rgba(255, 95, 0, 0.25);
        border-radius: 2px;
        padding: 0.85rem 1rem;
        color: rgba(255, 255, 255, 0.85);
        font-size: 0.84rem;
        line-height: 1.55;
        margin: 0;
        white-space: pre-wrap;
      }

      .modal-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.15rem 1.5rem;
        border-top: 1px solid rgba(255, 95, 0, 0.3);
        background: rgba(18, 9, 4, 0.95);
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .state-buttons {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .btn-state {
        padding: 0.5rem 0.85rem;
        font-size: 0.78rem;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .btn-approve {
        background: rgba(16, 185, 129, 0.2);
        border: 1px solid rgba(16, 185, 129, 0.6);
        color: #34d399;
      }

      .btn-approve:hover {
        background: #10b981;
        color: #0b0704;
      }

      .btn-reject {
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid rgba(239, 68, 68, 0.6);
        color: #fca5a5;
      }

      .btn-reject:hover {
        background: #ef4444;
        color: #ffffff;
      }

      .btn-pending {
        background: rgba(245, 158, 11, 0.2);
        border: 1px solid rgba(245, 158, 11, 0.6);
        color: #fbbf24;
      }

      .btn-pending:hover {
        background: #f59e0b;
        color: #0b0704;
      }

      .btn-close {
        padding: 0.5rem 1rem;
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #ffffff;
        font-size: 0.78rem;
        font-weight: 700;
        border-radius: 2px;
        cursor: pointer;
      }

      .btn-close:hover {
        border-color: #ffffff;
      }
    `,
  ],
})
export class AdminApplicationsComponent {
  readonly store = inject(AdminStoreService);

  readonly searchQuery = signal<string>('');
  readonly activeTab = signal<ApplicationFilterTab>('todas');
  readonly selectedApp = signal<AdminApplication | null>(null);

  readonly filteredApplications = computed(() => {
    let list = this.store.applications();
    const query = this.searchQuery().trim().toLowerCase();
    const tab = this.activeTab();

    // Filtro por pestaña
    if (tab === 'prestadores') {
      list = list.filter((a) => a.type === 'prestador');
    } else if (tab === 'fundadores') {
      list = list.filter((a) => a.type === 'fundador');
    } else if (tab === 'pendientes') {
      list = list.filter((a) => a.status === 'pendiente');
    } else if (tab === 'aprobadas') {
      list = list.filter((a) => a.status === 'aprobado');
    }

    // Filtro por búsqueda
    if (query) {
      list = list.filter((a) => {
        const nameMatch = a.fullName.toLowerCase().includes(query);
        const emailMatch = a.email.toLowerCase().includes(query);
        const phoneMatch = a.phone.includes(query);
        const catMatch = a.category ? a.category.toLowerCase().includes(query) : false;
        const regMatch = a.region ? a.region.toLowerCase().includes(query) : false;
        return nameMatch || emailMatch || phoneMatch || catMatch || regMatch;
      });
    }

    return list;
  });

  refresh(): void {
    void this.store.loadAllApplications();
  }

  openDetailModal(app: AdminApplication): void {
    this.selectedApp.set(app);
  }

  closeDetailModal(): void {
    this.selectedApp.set(null);
  }

  changeStatus(status: ApplicationStatus): void {
    const current = this.selectedApp();
    if (!current) return;
    void this.store.updateApplicationStatus(current.id, current.type, status);
    this.selectedApp.update((a) => (a ? { ...a, status } : null));
  }

  getWhatsappLink(phone?: string, name?: string): string {
    const cleanDigits = (phone || '').replace(/\D/g, '');
    const cleanName = encodeURIComponent(name || 'Postulante');
    return `https://wa.me/${cleanDigits}?text=Hola%20${cleanName},%20nos%20comunicamos%20desde%20la%20administraci%C3%B3n%20de%20EXPERIENCIAS.CLUB%20respecto%20a%20tu%20postulaci%C3%B3n`;
  }

  formatCategory(category?: string): string {
    switch (category) {
      case 'guia_montaña':
        return 'Guía de Montaña';
      case 'kayak_nautica':
        return 'Kayak & Náutica';
      case 'transporte_4x4':
        return 'Transporte & Travesías 4x4';
      case 'alojamiento':
        return 'Alojamiento & Hostería';
      case 'gastronomia':
        return 'Gastronomía Regional';
      case 'fotografia':
        return 'Fotografía & Expedición';
      case 'cabalgatas':
        return 'Cabalgatas';
      case 'arqueologia':
        return 'Arqueología & Patrimonio';
      case 'artesanias':
        return 'Artesanías & Cultura';
      default:
        return category ? category.replace(/_/g, ' ') : 'Servicios Turísticos';
    }
  }

  getSnippet(text?: string): string {
    if (!text) return 'Sin detalle';
    return text.length > 90 ? text.slice(0, 90) + '...' : text;
  }

  downloadRoster(): void {
    const list = this.store.applications();
    const headers = [
      'Tipo',
      'Nombre y Apellido',
      'Email',
      'Teléfono',
      'Rubro / Categoría',
      'Región',
      'Sitio Web',
      'Estado',
      'Fecha Postulación',
      'Detalle / Carta',
    ];
    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
    const rows = [
      headers.map(escapeCsv).join(','),
      ...list.map((a) => [
        escapeCsv(a.type === 'prestador' ? 'Prestador' : 'Socio Fundador'),
        escapeCsv(a.fullName),
        escapeCsv(a.email),
        escapeCsv(a.phone),
        escapeCsv(a.type === 'prestador' ? this.formatCategory(a.category) : 'Cuadro Fundacional'),
        escapeCsv(a.region || 'Catamarca'),
        escapeCsv(a.website || ''),
        escapeCsv(a.status.toUpperCase()),
        escapeCsv(new Date(a.createdAt).toLocaleDateString('es-AR')),
        escapeCsv(a.type === 'prestador' ? a.description || '' : a.motivationLetter || ''),
      ].join(',')),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `postulaciones_experiencias_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

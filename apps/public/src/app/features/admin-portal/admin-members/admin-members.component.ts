import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminStoreService, AdminMember } from '../../../core/services/admin-store.service';
import { FechaPipe } from '../../../shared/pipes/format.pipes';

type MemberFilterTab = 'todos' | 'socios' | 'waitlist' | 'google' | 'convertidos';

@Component({
  selector: 'app-admin-members',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, FechaPipe],
  template: `
    <div class="members-container">
      <div class="members-header">
        <div>
          <span class="section-kicker">NÓMINA GENERAL DEL CLUB</span>
          <h1 class="card-heading">Lista Completa de Socios & Waitlist</h1>
          <p class="card-subheading">
            Padrón consolidado de socios emergentes, plenos, fundadores y prospectos de la lista de espera.
            La conversión refleja a los miembros que han pagado por al menos una experiencia o enviado su comprobante.
          </p>
        </div>
      </div>

      <!-- Métricas Rápidas de Nómina: Día, Semana, Mes y Total -->
      <div class="summary-strip">
        <div class="summary-item">
          <span class="sum-label">Socios del Día</span>
          <strong class="sum-value">{{ store.stats().membersToday }}</strong>
          <span class="sum-sub">Registrados hoy</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Socios de la Semana</span>
          <strong class="sum-value">{{ store.stats().membersThisWeek }}</strong>
          <span class="sum-sub">Últimos 7 días</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Socios del Mes</span>
          <strong class="sum-value">{{ store.stats().membersThisMonth }}</strong>
          <span class="sum-sub">Mes en curso</span>
        </div>
        <div class="summary-item">
          <span class="sum-label">Total Socios</span>
          <strong class="sum-value">{{ store.stats().totalRecords }}</strong>
          <span class="sum-sub">{{ store.stats().totalSocios }} confirmados + {{ store.stats().totalWaitlist }} en espera</span>
        </div>
      </div>

      <!-- Filtros y Búsqueda -->
      <div class="filters-bar">
        <div class="search-box">
          <mat-icon class="search-icon">search</mat-icon>
          <input
            type="text"
            class="search-input"
            placeholder="Buscar por nombre, email, DNI, teléfono o # socio..."
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
            [class.is-active]="activeTab() === 'todos'"
            (click)="activeTab.set('todos')"
          >
            Todos ({{ store.stats().totalRecords }})
          </button>

          <button
            type="button"
            class="filter-tab"
            [class.is-active]="activeTab() === 'socios'"
            (click)="activeTab.set('socios')"
          >
            Socios Oficiales ({{ store.stats().totalSocios }})
          </button>

          <button
            type="button"
            class="filter-tab"
            [class.is-active]="activeTab() === 'waitlist'"
            (click)="activeTab.set('waitlist')"
          >
            Lista de Espera ({{ store.stats().totalWaitlist }})
          </button>

          <button
            type="button"
            class="filter-tab"
            [class.is-active]="activeTab() === 'google'"
            (click)="activeTab.set('google')"
          >
            Google Vinculado ({{ store.stats().totalGoogleLinked }})
          </button>

          <button
            type="button"
            class="filter-tab"
            [class.is-active]="activeTab() === 'convertidos'"
            (click)="activeTab.set('convertidos')"
          >
            Pago OK ({{ store.stats().totalConverted }})
          </button>
        </div>
      </div>

      <!-- Tabla Principal de Socios & Waitlist -->
      @if (filteredMembers().length === 0) {
        <div class="empty-box">
          <mat-icon>person_search</mat-icon>
          <h3>No se encontraron registros</h3>
          <p>Probá cambiando la búsqueda o seleccionando otra pestaña de filtro.</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="members-table">
            <thead>
              <tr>
                <th class="col-socio"># Socio</th>
                <th class="col-titular">Titular</th>
                <th class="col-contacto">Contacto</th>
                <th class="col-dni">DNI</th>
                <th class="col-nivel">Membresía</th>
                <th class="col-estado">Estado</th>
                <th class="col-fecha">Fecha Registro</th>
              </tr>
            </thead>
            <tbody>
              @for (m of filteredMembers(); track m.id) {
                <tr [class.is-waitlist]="m.type === 'waitlist'" [class.is-google]="m.googleLinked">
                  <!-- # Socio / Posición -->
                  <td>
                    @if (m.type === 'socio') {
                      <div class="socio-number-badge">
                        <span class="socio-hash">#</span>
                        <strong>{{ m.position }}</strong>
                      </div>
                    } @else {
                      <span class="waitlist-pill">Waitlist</span>
                    }
                  </td>

                  <!-- Titular -->
                  <td>
                    <div class="member-identity">
                      <strong class="member-name">{{ m.fullName || '—' }}</strong>
                      @if (m.type === 'waitlist') {
                        <span class="member-sub-hint">Pendiente de completar formulario</span>
                      } @else if (m.experiencesWishlist && m.experiencesWishlist.length > 0) {
                        <span class="member-sub-hint">Deseos: {{ m.experiencesWishlist.join(', ') }}</span>
                      }
                    </div>
                  </td>

                  <!-- Contacto (Email + WhatsApp) -->
                  <td>
                    <div class="member-contact">
                      <span class="contact-email">
                        {{ m.email }}
                      </span>
                      @if (m.phone && m.phone !== '—') {
                        <a
                          [href]="getWhatsappLink(m.phone, m.fullName)"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="contact-whatsapp"
                          title="Contactar vía WhatsApp"
                        >
                          <span>{{ m.phone }}</span>
                        </a>
                      }
                    </div>
                  </td>

                  <!-- DNI -->
                  <td>
                    <span class="member-dni font-mono">{{ m.dni || '—' }}</span>
                  </td>

                  <!-- Membresía -->
                  <td>
                    <span class="tier-badge" [attr.data-tier]="m.membershipTier">
                      {{ formatTier(m.membershipTier) }}
                    </span>
                  </td>

                  <!-- Google y Conversión -->
                  <td>
                    <div class="status-tags-row">
                      @if (m.googleLinked) {
                        <span class="google-linked-pill" title="Cuenta vinculada vía Google OAuth">Google</span>
                      }

                      @if (m.converted) {
                        <span class="converted-pill" title="Pagó al menos una experiencia / envió comprobante">Pago OK</span>
                      } @else {
                        <span class="pending-conversion-pill" title="Sin comprobante ni pago registrado">Sin Pago Aún</span>
                      }
                    </div>
                  </td>

                  <!-- Fecha de Registro -->
                  <td>
                    <span class="member-date">{{ m.createdAt | fecha: 'corta' }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Acciones al pie de la tabla -->
        <div class="table-footer-actions">
          <button type="button" class="btn-footer-action" (click)="refresh()" [disabled]="store.isLoadingMembers()">
            {{ store.isLoadingMembers() ? 'Actualizando...' : 'Refrescar Datos' }}
          </button>

          <button type="button" class="btn-footer-action" (click)="downloadRoster()">
            Descargar Planilla
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .members-container {
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

      .members-header {
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

      .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .refresh-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 1rem;
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

      .export-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 1.15rem;
        background: #ff5f00;
        color: #0b0704;
        border: none;
        border-radius: 2px;
        font-size: 0.82rem;
        font-weight: 800;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .export-btn:hover {
        background: #ff7728;
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(255, 95, 0, 0.35);
      }

      .export-btn mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
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
      .text-blue { color: #60a5fa !important; }
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
        transition: border-color 0.2s;
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

      /* Members Table */
      .table-wrapper {
        background: rgba(20, 10, 5, 0.82);
        border: 1px solid rgba(255, 95, 0, 0.35);
        border-radius: 2px;
        overflow-x: auto;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      }

      .members-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.82rem;
      }

      .members-table th {
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

      .members-table td {
        padding: 0.85rem 1rem;
        border-bottom: 1px solid rgba(255, 95, 0, 0.15);
        color: rgba(255, 255, 255, 0.85);
        vertical-align: middle;
      }

      .members-table tbody tr:hover {
        background: rgba(255, 95, 0, 0.08);
      }

      .members-table tbody tr.is-waitlist {
        background: rgba(0, 0, 0, 0.15);
      }

      .socio-number-badge {
        display: inline-flex;
        align-items: baseline;
        gap: 0.15rem;
        padding: 0.25rem 0.55rem;
        background: rgba(255, 95, 0, 0.18);
        border: 1px solid rgba(255, 95, 0, 0.45);
        color: #ffffff;
        font-family: var(--font-mono, monospace);
        font-size: 0.85rem;
        border-radius: 2px;
      }

      .socio-hash {
        color: #ff5f00;
        font-weight: 800;
      }

      .waitlist-pill {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.75);
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-radius: 2px;
      }

      .member-identity {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }

      .member-name {
        color: #ffffff;
        font-size: 0.88rem;
      }

      .member-sub-hint {
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.5);
      }

      .member-contact {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .contact-email {
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

      .wa-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .font-mono {
        font-family: var(--font-mono, monospace);
      }

      .tier-badge {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        border-radius: 2px;
        letter-spacing: 0.05em;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.25);
        color: #ffffff;
      }

      .status-tags-row {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }

      .google-linked-pill {
        display: inline-flex;
        align-items: center;
        padding: 0.15rem 0.45rem;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.25);
        color: #ffffff;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        border-radius: 2px;
        width: fit-content;
      }

      .converted-pill {
        display: inline-flex;
        align-items: center;
        padding: 0.15rem 0.45rem;
        background: rgba(16, 185, 129, 0.2);
        border: 1px solid rgba(16, 185, 129, 0.45);
        color: #34d399;
        font-size: 0.68rem;
        font-weight: 800;
        border-radius: 2px;
        width: fit-content;
      }

      .converted-pill mat-icon {
        font-size: 12px;
        width: 12px;
        height: 12px;
      }

      .pending-conversion-pill {
        font-size: 0.68rem;
        color: rgba(255, 255, 255, 0.45);
        font-weight: 600;
      }

      .member-date {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.6);
        white-space: nowrap;
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
    `,
  ],
})
export class AdminMembersComponent {
  readonly store = inject(AdminStoreService);

  readonly searchQuery = signal<string>('');
  readonly activeTab = signal<MemberFilterTab>('todos');

  readonly filteredMembers = computed(() => {
    let list = this.store.members();
    const query = this.searchQuery().trim().toLowerCase();
    const tab = this.activeTab();

    // Filtro por pestaña
    if (tab === 'socios') {
      list = list.filter((m) => m.type === 'socio');
    } else if (tab === 'waitlist') {
      list = list.filter((m) => m.type === 'waitlist');
    } else if (tab === 'google') {
      list = list.filter((m) => m.googleLinked);
    } else if (tab === 'convertidos') {
      list = list.filter((m) => m.converted);
    }

    // Filtro por búsqueda
    if (query) {
      list = list.filter((m) => {
        const nameMatch = m.fullName?.toLowerCase().includes(query) ?? false;
        const emailMatch = m.email.toLowerCase().includes(query);
        const dniMatch = m.dni?.includes(query) ?? false;
        const phoneMatch = m.phone?.includes(query) ?? false;
        const posMatch = m.position ? String(m.position).includes(query) : false;
        return nameMatch || emailMatch || dniMatch || phoneMatch || posMatch;
      });
    }

    return list;
  });

  refresh(): void {
    void this.store.loadAllMembers();
  }

  downloadRoster(): void {
    const list = this.store.members();
    const headers = ['Nro Socio', 'Tipo', 'Nombre y Apellido', 'DNI', 'Email', 'Teléfono', 'Nivel', 'Google Vinculado', 'Convertido', 'Fecha Alta'];
    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
    const rows = [
      headers.map(escapeCsv).join(','),
      ...list.map((m) => [
        escapeCsv(m.position ? `#${m.position}` : 'Waitlist'),
        escapeCsv(m.type === 'socio' ? 'Oficial' : 'Lista Espera'),
        escapeCsv(m.fullName || ''),
        escapeCsv(m.dni || ''),
        escapeCsv(m.email || ''),
        escapeCsv(m.phone || ''),
        escapeCsv(m.membershipTier.toUpperCase()),
        escapeCsv(m.googleLinked ? 'SÍ' : 'NO'),
        escapeCsv(m.converted ? 'SÍ' : 'NO'),
        escapeCsv(new Date(m.createdAt).toLocaleDateString('es-AR')),
      ].join(',')),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nomina_socios_experiencias_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  getWhatsappLink(phone?: string, name?: string): string {
    const cleanDigits = (phone || '').replace(/\D/g, '');
    const cleanName = encodeURIComponent(name || 'Socio');
    return `https://wa.me/${cleanDigits}?text=Hola%20${cleanName},%20nos%20comunicamos%20desde%20la%20administraci%C3%B3n%20de%20EXPERIENCIAS.CLUB`;
  }

  formatTier(tier: string): string {
    switch (tier) {
      case 'fundador':
        return 'Socio Fundador';
      case 'activo':
        return 'Socio Activo';
      case 'emergente':
        return 'Socio Emergente';
      default:
        return 'Lista de Espera';
    }
  }
}


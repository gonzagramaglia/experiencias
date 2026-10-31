import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AdminStoreService } from '../../core/services/admin-store.service';
import { AdminLoginComponent } from './admin-login/admin-login.component';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatIconModule, AdminLoginComponent],
  template: `
    <div class="admin-portal-root">
      <!-- Domain indicator strip con estilo sobrio oficial naranja #ff5f00 -->
      <div class="subdomain-strip">
        <div class="subdomain-content">
          <div class="subdomain-left">
            <span class="subdomain-host">admin.experiencias.club</span>
          </div>
          <div class="subdomain-right">
            <a
              href="https://experiencias.club"
              class="back-public-link"
              target="_blank"
              rel="noopener"
              title="Ir a experiencias.club"
            >
              <mat-icon>open_in_new</mat-icon>
              <span>Ir a experiencias.club</span>
            </a>
          </div>
        </div>
      </div>

      @if (!store.isAuthenticated()) {
        <!-- Login cuando no hay sesión activa -->
        <app-admin-login />
      } @else {
        <!-- Header oficial de Administración con logo emblema y navegación sobria -->
        <header class="portal-header">
          <div class="header-inner">
            <div class="header-left">
              <a routerLink="/dashboard" class="portal-brand">
                <img
                  src="/assets/images/logo-admin-experiencias.png"
                  alt="Emblema Admin Experiencias"
                  class="brand-emblem-img"
                  referrerpolicy="no-referrer"
                />
                <div class="brand-text">
                  <span class="brand-title">EXPERIENCIAS.CLUB</span>
                  <span class="brand-tag">ADMINISTRACIÓN</span>
                </div>
              </a>
            </div>

            <!-- Menú de administrador -->
            <div class="header-right">
              <div class="user-pill" (click)="toggleUserMenu()">
                <img
                  src="/assets/images/gonza.jpg"
                  [alt]="admin()?.name || 'Gonzalo Gramaglia'"
                  class="user-avatar"
                  referrerpolicy="no-referrer"
                />
                <div class="user-meta">
                  <strong class="user-name">{{ admin()?.name || 'Gonzalo Gramaglia' }}</strong>
                  <span class="user-agency">Superadmin</span>
                </div>
                <mat-icon class="dropdown-chevron">expand_more</mat-icon>

                @if (userMenuOpen()) {
                  <div class="dropdown-menu enlarged-menu" (click)="$event.stopPropagation()">
                    <div class="dropdown-header">
                      <div class="dropdown-user-row">
                        <img
                          src="/assets/images/gonza.jpg"
                          [alt]="admin()?.name || 'Gonzalo Gramaglia'"
                          class="dropdown-avatar-lg"
                          referrerpolicy="no-referrer"
                        />
                        <div class="dropdown-user-details">
                          <strong class="dropdown-user-name">{{ admin()?.name || 'Gonzalo Gramaglia' }}</strong>
                          <span class="dropdown-user-email">{{ admin()?.email || 'gonzagramaglia@gmail.com' }}</span>
                          <span class="dropdown-user-tag">Superadmin</span>
                        </div>
                      </div>
                    </div>

                    <div class="dropdown-divider"></div>

                    <!-- Navegación mínima del administrador -->
                    <div class="dropdown-nav-list">
                      <a
                        routerLink="/dashboard"
                        class="dropdown-item enlarged-item"
                        (click)="userMenuOpen.set(false)"
                      >
                        <mat-icon class="menu-item-icon">dashboard</mat-icon>
                        <div class="menu-item-info">
                          <strong class="menu-item-title">Panel de Control</strong>
                        </div>
                      </a>

                      <a
                        routerLink="/socios"
                        class="dropdown-item enlarged-item"
                        (click)="userMenuOpen.set(false)"
                      >
                        <mat-icon class="menu-item-icon">group</mat-icon>
                        <div class="menu-item-info">
                          <strong class="menu-item-title">Ver Socios</strong>
                        </div>
                      </a>

                      <a
                        routerLink="/comprobantes"
                        class="dropdown-item enlarged-item"
                        (click)="userMenuOpen.set(false)"
                      >
                        <mat-icon class="menu-item-icon">receipt_long</mat-icon>
                        <div class="menu-item-info">
                          <strong class="menu-item-title">Ver Comprobantes</strong>
                        </div>
                      </a>

                      <a
                        routerLink="/postulaciones"
                        class="dropdown-item enlarged-item"
                        (click)="userMenuOpen.set(false)"
                      >
                        <mat-icon class="menu-item-icon">assignment_ind</mat-icon>
                        <div class="menu-item-info">
                          <strong class="menu-item-title">Ver Postulaciones</strong>
                        </div>
                      </a>
                    </div>

                    <div class="dropdown-divider"></div>

                    <button
                      type="button"
                      class="dropdown-item enlarged-item logout-item"
                      (click)="logout()"
                    >
                      <mat-icon class="menu-item-icon">logout</mat-icon>
                      <div class="menu-item-info">
                        <strong class="menu-item-title">Cerrar sesión</strong>
                      </div>
                    </button>
                  </div>
                }
              </div>
            </div>
          </div>
        </header>

        <!-- Contenedor principal -->
        <main class="portal-main">
          <div class="portal-content-container">
            <router-outlet />
          </div>
        </main>
      }

      <!-- Footer oficial con logo banner horizontal -->
      <footer class="portal-footer">
        <div class="footer-inner">
          <div class="footer-center-logo">
            <img
              src="/assets/images/logo-admin-experiencias-club.png"
              alt="EXPERIENCIAS.CLUB ADMINISTRACIÓN"
              class="footer-banner-img"
              referrerpolicy="no-referrer"
            />
            <p class="footer-subtitle">
              Portal Oficial de Administración Central del Club de Experiencias Catamarca
            </p>
          </div>
        </div>
      </footer>
    </div>
  `,
  styleUrl: './admin-panel.component.css',
})
export class AdminPanelComponent {
  readonly store = inject(AdminStoreService);
  private readonly router = inject(Router);

  readonly admin = this.store.currentAdmin;
  readonly userMenuOpen = signal(false);

  constructor() {
    void this.store.restoreSupabaseSession();
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
  }

  @HostListener('document:click', ['$event'])
  closeMenuOutside(event: Event): void {
    const target = event.target;
    if (target instanceof Element && !target.closest('.user-pill')) {
      this.userMenuOpen.set(false);
    }
  }

  logout(): void {
    this.store.logout();
    this.userMenuOpen.set(false);
    this.router.navigate(['/']);
  }
}

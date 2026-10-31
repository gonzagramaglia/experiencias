import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

const isBrowser = typeof window !== 'undefined';
const host = isBrowser ? window.location.hostname.toLowerCase() : '';
const search = isBrowser ? window.location.search.toLowerCase() : '';

const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

// Detección estricta de subdominios (y soporte para pruebas locales con subdominio o ?portal=admin/prestador)
const isAdminHost =
  host.startsWith('admin.') ||
  host.includes('admin.experiencias') ||
  (isLocalHost && (search.includes('portal=admin') || search.includes('admin=true')));

const isProviderHost =
  host.startsWith('prestadores.') ||
  host.includes('prestadores.experiencias') ||
  (isLocalHost && (search.includes('portal=prestador') || search.includes('prestador=true')));

// ══════════════════════════════════════════════════════════════════════
// 1. Rutas exclusivas de administración central (admin.experiencias.club)
// ══════════════════════════════════════════════════════════════════════
const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/admin-portal/admin-panel.component').then(
        (m) => m.AdminPanelComponent,
      ),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin-portal/admin-dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },
      {
        path: 'socios',
        loadComponent: () =>
          import('./features/admin-portal/admin-members/admin-members.component').then(
            (m) => m.AdminMembersComponent,
          ),
      },
      {
        path: 'comprobantes',
        loadComponent: () =>
          import('./features/admin-portal/admin-receipts/admin-receipts.component').then(
            (m) => m.AdminReceiptsComponent,
          ),
      },
      {
        path: 'postulaciones',
        loadComponent: () =>
          import('./features/admin-portal/admin-applications/admin-applications.component').then(
            (m) => m.AdminApplicationsComponent,
          ),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];

// ══════════════════════════════════════════════════════════════════════
// 2. Rutas exclusivas del portal de prestadores (prestadores.experiencias.club)
// ══════════════════════════════════════════════════════════════════════
const providerRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/provider-panel/provider-panel.component').then(
        (m) => m.ProviderPanelComponent,
      ),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/provider-panel/provider-dashboard/provider-dashboard.component').then(
            (m) => m.ProviderDashboardComponent,
          ),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];

// ══════════════════════════════════════════════════════════════════════
// 3. Rutas del portal público principal (experiencias.club)
// ══════════════════════════════════════════════════════════════════════
const publicRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/waitlist/waitlist.component').then((m) => m.WaitlistComponent),
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'perfil/actividades',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/profile/activities-history/activities-history.component').then(
        (m) => m.ActivitiesHistoryComponent,
      ),
  },
  {
    path: 'ingresar',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'login',
    redirectTo: 'ingresar',
    pathMatch: 'full',
  },
  {
    path: 'socios',
    loadComponent: () =>
      import('./features/members/members.component').then((m) => m.MembersComponent),
  },
  {
    path: 'socios/emergentes',
    loadComponent: () =>
      import('./features/members/emerging-member/emerging-member.component').then(
        (m) => m.EmergingMemberComponent,
      ),
  },
  {
    path: 'socios/emergentes/ingreso',
    redirectTo: 'socios/emergentes',
    pathMatch: 'full',
  },
  {
    path: 'emergentes',
    redirectTo: 'socios/emergentes',
    pathMatch: 'full',
  },
  {
    path: 'socios/plenos',
    loadComponent: () =>
      import('./features/subscription/subscription.component').then(
        (m) => m.SubscriptionComponent,
      ),
  },
  {
    path: 'socios/activar',
    redirectTo: 'socios/plenos',
    pathMatch: 'full',
  },
  {
    path: 'activar',
    redirectTo: 'socios/plenos',
    pathMatch: 'full',
  },
  {
    path: 'socios/fundadores',
    loadComponent: () =>
      import('./features/founders/founders.component').then((m) => m.FoundersComponent),
  },
  {
    path: 'fundadores',
    redirectTo: 'socios/fundadores',
    pathMatch: 'full',
  },
  {
    path: 'experiencias',
    loadComponent: () =>
      import('./features/experiences/experiences.component').then(
        (m) => m.ExperiencesComponent,
      ),
  },
  {
    path: 'experiencias/fotos',
    loadComponent: () =>
      import('./features/experiences/experiences-photos/experiences-photos.component').then(
        (m) => m.ExperiencesPhotosComponent,
      ),
  },
  {
    path: 'fotos',
    redirectTo: 'experiencias/fotos',
    pathMatch: 'full',
  },
  {
    path: 'experiencias/kayak',
    loadComponent: () =>
      import('./features/experiences/kayak-experience/kayak-experience.component').then(
        (m) => m.KayakExperienceComponent,
      ),
  },
  {
    path: 'experiencias/kayak/fotos',
    loadComponent: () =>
      import('./features/experiences/kayak-experience/kayak-photos/kayak-photos.component').then(
        (m) => m.KayakPhotosComponent,
      ),
  },
  {
    path: 'experiencias/kayak/calificaciones',
    loadComponent: () =>
      import('./features/experiences/kayak-experience/kayak-ratings/kayak-ratings.component').then(
        (m) => m.KayakRatingsComponent,
      ),
  },
  {
    path: 'experiencias/kayak/calificacion',
    redirectTo: 'experiencias/kayak/calificaciones',
    pathMatch: 'full',
  },
  {
    path: 'kayak/calificaciones',
    redirectTo: 'experiencias/kayak/calificaciones',
    pathMatch: 'full',
  },
  {
    path: 'kayak/calificacion',
    redirectTo: 'experiencias/kayak/calificaciones',
    pathMatch: 'full',
  },
  {
    path: 'experiencia/kayak/calificacion',
    redirectTo: 'experiencias/kayak/calificaciones',
    pathMatch: 'full',
  },
  {
    path: 'experiencia/kayak/calificaciones',
    redirectTo: 'experiencias/kayak/calificaciones',
    pathMatch: 'full',
  },
  {
    path: 'experiencia/kayak/fotos',
    redirectTo: 'experiencias/kayak/fotos',
    pathMatch: 'full',
  },
  {
    path: 'experiencia/kayak',
    redirectTo: 'experiencias/kayak',
    pathMatch: 'full',
  },
  {
    path: 'experiencias/kayak/pago',
    data: { slug: 'kayak' },
    loadComponent: () =>
      import('./features/experiences/experience-payment/experience-payment.component').then(
        (m) => m.ExperiencePaymentComponent,
      ),
  },

  // "La web de antes" para prestadores y convocatoria abierta
  {
    path: 'prestadores',
    loadComponent: () =>
      import('./features/providers/providers.component').then((m) => m.ProvidersComponent),
  },
  {
    path: 'experiencias/prestadores',
    redirectTo: 'prestadores',
    pathMatch: 'full',
  },

  {
    path: '404',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];

// Dependiendo del subdominio en el navegador, se cargan las rutas correspondientes:
// - admin.experiencias.club -> adminRoutes (raíz redirige a dashboard)
// - prestadores.experiencias.club -> providerRoutes (raíz redirige a dashboard)
// - experiencias.club -> publicRoutes (/admin no existe, /prestadores lleva a la web de registro)
export const routes: Routes = isAdminHost
  ? adminRoutes
  : isProviderHost
    ? providerRoutes
    : publicRoutes;

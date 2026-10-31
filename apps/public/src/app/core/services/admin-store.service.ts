import { Injectable, computed, inject, signal } from '@angular/core';
import { SUPABASE_CLIENT, isSupabaseConfigured } from '../supabase/supabase.client';
import { TransferSubmission, TransferStatus } from '../models/bank-transfer.model';
import { NewsletterService } from './newsletter.service';
import { ProviderStoreService } from './provider-store.service';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'superadmin' | 'operador';
  avatar?: string;
  joinedAt: string;
}

export interface AdminMember {
  id: string;
  type: 'socio' | 'waitlist';
  email: string;
  fullName?: string;
  dni?: string;
  phone?: string;
  position?: number;
  membershipTier: 'emergente' | 'activo' | 'fundador' | 'waitlist';
  googleLinked: boolean;
  converted: boolean;
  experiencesWishlist: string[];
  experiencesOther?: string;
  createdAt: string;
}

export type ApplicationType = 'prestador' | 'fundador';
export type ApplicationStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface AdminApplication {
  id: string;
  type: ApplicationType;
  fullName: string;
  email: string;
  phone: string;
  category?: string;
  region?: string;
  website?: string;
  description?: string;
  motivationLetter?: string;
  status: ApplicationStatus;
  createdAt: string;
}

const STORAGE_KEYS = {
  adminSession: 'catamarca_admin_session_v1',
  adminMembersCache: 'catamarca_admin_members_cache_v2',
  adminApplicationsCache: 'catamarca_admin_applications_cache_v1',
};

const DEFAULT_SUPERADMIN: AdminUser = {
  id: 'admin-gonza',
  email: 'gonzagramaglia@gmail.com',
  name: 'Gonzalo Gramaglia',
  role: 'superadmin',
  avatar: '/assets/images/gonza.jpg',
  joinedAt: '2024-01-01T00:00:00Z',
};

@Injectable({
  providedIn: 'root',
})
export class AdminStoreService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly newsletter = inject(NewsletterService);
  private readonly providerStore = inject(ProviderStoreService);

  private readonly _currentAdmin = signal<AdminUser | null>(this.loadStoredSession());
  private readonly _members = signal<AdminMember[]>(this.loadStoredMembers());
  private readonly _submissions = signal<TransferSubmission[]>([]);
  private readonly _applications = signal<AdminApplication[]>(this.loadStoredApplications());
  private readonly _isLoadingMembers = signal<boolean>(false);
  private readonly _isLoadingSubmissions = signal<boolean>(false);
  private readonly _isLoadingApplications = signal<boolean>(false);
  private readonly _lastRefreshedAt = signal<string | null>(null);

  readonly currentAdmin = this._currentAdmin.asReadonly();
  readonly isAuthenticated = computed(() => this._currentAdmin() !== null);
  readonly members = this._members.asReadonly();
  readonly submissions = this._submissions.asReadonly();
  readonly applications = this._applications.asReadonly();
  readonly isLoadingMembers = this._isLoadingMembers.asReadonly();
  readonly isLoadingSubmissions = this._isLoadingSubmissions.asReadonly();
  readonly isLoadingApplications = this._isLoadingApplications.asReadonly();
  readonly lastRefreshedAt = this._lastRefreshedAt.asReadonly();

  // Estadísticas de Postulaciones (Prestadores y Fundadores)
  readonly applicationStats = computed(() => {
    const list = this._applications();
    const prestadores = list.filter((a) => a.type === 'prestador');
    const fundadores = list.filter((a) => a.type === 'fundador');
    const pendientes = list.filter((a) => a.status === 'pendiente');
    const aprobadas = list.filter((a) => a.status === 'aprobado');
    return {
      total: list.length,
      prestadoresCount: prestadores.length,
      fundadoresCount: fundadores.length,
      pendientesCount: pendientes.length,
      aprobadasCount: aprobadas.length,
    };
  });

  // Estadísticas del Panel Admin
  readonly stats = computed(() => {
    const list = this._members();
    const subs = this._submissions();

    const officialSocios = list.filter((m) => m.type === 'socio');
    const waitlistOnly = list.filter((m) => m.type === 'waitlist');
    const googleLinked = list.filter((m) => m.googleLinked);
    const converted = list.filter((m) => m.converted);

    const approvedSubs = subs.filter((s) => s.status === 'aprobado');
    const pendingSubs = subs.filter((s) => s.status === 'pendiente');
    const rejectedSubs = subs.filter((s) => s.status === 'rechazado');

    const confirmedRevenue = approvedSubs.reduce((sum, s) => sum + s.amountArs, 0);
    const pendingRevenue = pendingSubs.reduce((sum, s) => sum + s.amountArs, 0);
    const totalEnrolled = approvedSubs.reduce((sum, s) => sum + s.participants, 0);

    const conversionRate = list.length > 0
      ? Math.round((converted.length / list.length) * 100)
      : 0;

    // Métricas temporales (Día, Semana, Mes)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = startOfToday - 6 * 86400000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const thirtyDaysAgo = startOfToday - 29 * 86400000;
    const monthBoundary = Math.min(startOfMonth, thirtyDaysAgo);

    const isToday = (dateStr?: string) => {
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      return !isNaN(t) && t >= startOfToday;
    };

    const isThisWeek = (dateStr?: string) => {
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      return !isNaN(t) && t >= sevenDaysAgo;
    };

    const isThisMonth = (dateStr?: string) => {
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      return !isNaN(t) && t >= monthBoundary;
    };

    const membersToday = list.filter((m) => isToday(m.createdAt)).length;
    const membersThisWeek = list.filter((m) => isThisWeek(m.createdAt)).length;
    const membersThisMonth = list.filter((m) => isThisMonth(m.createdAt)).length;

    const revenueToday = approvedSubs
      .filter((s) => isToday(s.submittedAt || s.date))
      .reduce((sum, s) => sum + s.amountArs, 0);

    const revenueThisWeek = approvedSubs
      .filter((s) => isThisWeek(s.submittedAt || s.date))
      .reduce((sum, s) => sum + s.amountArs, 0);

    const revenueThisMonth = approvedSubs
      .filter((s) => isThisMonth(s.submittedAt || s.date))
      .reduce((sum, s) => sum + s.amountArs, 0);

    return {
      totalRecords: list.length,
      totalSocios: officialSocios.length,
      totalWaitlist: waitlistOnly.length,
      totalGoogleLinked: googleLinked.length,
      totalConverted: converted.length,
      conversionRate,
      totalSubmissions: subs.length,
      pendingReceiptsCount: pendingSubs.length,
      approvedReceiptsCount: approvedSubs.length,
      rejectedReceiptsCount: rejectedSubs.length,
      confirmedRevenue,
      pendingRevenue,
      totalEnrolled,
      membersToday,
      membersThisWeek,
      membersThisMonth,
      revenueToday,
      revenueThisWeek,
      revenueThisMonth,
    };
  });

  constructor() {
    void this.restoreSupabaseSession();
    void this.loadAllMembers();
    void this.loadAllSubmissions();
    void this.loadAllApplications();
  }

  // ============================================================
  // SESIÓN ADMINISTRATIVA
  // ============================================================

  async restoreSupabaseSession(): Promise<void> {
    if (!isSupabaseConfigured()) {
      // Entorno de prueba local
      if (!this._currentAdmin()) {
        this.saveSession(DEFAULT_SUPERADMIN);
      }
      return;
    }

    try {
      const { data } = await this.supabase.auth.getUser();
      const email = data.user?.email?.trim().toLowerCase();

      if (!email) {
        if (!this.loadStoredSession()) {
          this._currentAdmin.set(null);
        }
        return;
      }

      // 1. Consultar si tiene registro en admin_access
      const { data: adminRow } = await this.supabase
        .from('admin_access' as any)
        .select('*')
        .eq('email', email)
        .eq('active', true)
        .maybeSingle();

      const userMeta = data.user?.user_metadata || {};
      const fullName = (adminRow as any)?.name || userMeta['full_name'] || userMeta['name'] || email.split('@')[0];
      const avatar = '/assets/images/gonza.jpg';

      // Se permite acceso si está en la tabla admin_access o si coincide con gonzagramaglia@gmail.com
      const isSuperAdminEmail = email === 'gonzagramaglia@gmail.com' || email.endsWith('@experiencias.club');

      if (adminRow || isSuperAdminEmail) {
        const admin: AdminUser = {
          id: `admin-${email.replace(/[^a-z0-9]+/g, '-')}`,
          email,
          name: fullName,
          role: (adminRow as any)?.role || 'superadmin',
          avatar,
          joinedAt: new Date().toISOString(),
        };
        this.saveSession(admin);
      }
    } catch (err) {
      console.warn('[AdminStore] Error restaurando sesión Supabase:', err);
    }
  }

  async signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) {
      this.saveSession(DEFAULT_SUPERADMIN);
      return { success: true };
    }

    try {
      const redirectOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://admin.experiencias.club';
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${redirectOrigin}/dashboard`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error al conectar con Google' };
    }
  }

  quickLogin(): void {
    this.saveSession(DEFAULT_SUPERADMIN);
    void this.loadAllMembers();
    void this.loadAllSubmissions();
  }

  logout(): void {
    this._currentAdmin.set(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.adminSession);
    } catch {
      // ignore
    }
    if (isSupabaseConfigured()) {
      void this.supabase.auth.signOut();
    }
  }

  private saveSession(admin: AdminUser): void {
    this._currentAdmin.set(admin);
    try {
      localStorage.setItem(STORAGE_KEYS.adminSession, JSON.stringify(admin));
    } catch {
      // ignore
    }
  }

  private loadStoredSession(): AdminUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.adminSession);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // GESTIÓN DE SOCIOS Y LISTA DE ESPERA (NÓMINA COMPLETA)
  // ============================================================

  async loadAllMembers(): Promise<void> {
    this._isLoadingMembers.set(true);

    try {
      if (isSupabaseConfigured()) {
        // 1. Intentar RPC get_admin_all_members
        const { data: rpcData, error: rpcErr } = await this.supabase.rpc('get_admin_all_members' as any);

        if (!rpcErr && rpcData) {
          const payload = rpcData as any;
          const socios: AdminMember[] = (payload.socios || []).map((s: any) => ({
            id: s.id,
            type: 'socio' as const,
            email: s.email,
            fullName: s.fullName || s.full_name || 'Socio sin nombre',
            dni: s.dni || '—',
            phone: s.phone || '—',
            position: s.position,
            membershipTier: s.membershipTier || s.membership_tier || 'emergente',
            googleLinked: Boolean(s.googleLinked || s.google_linked),
            // Convertido = pagó al menos una experiencia / envió comprobante
            converted: Boolean(s.converted || s.paymentsCount > 0),
            experiencesWishlist: Array.isArray(s.experiencesWishlist) ? s.experiencesWishlist : [],
            experiencesOther: s.experiencesOther || s.experiences_other,
            createdAt: s.createdAt || s.created_at || new Date().toISOString(),
          }));

          const waitlist: AdminMember[] = (payload.waitlist || []).map((w: any) => ({
            id: w.id,
            type: 'waitlist' as const,
            email: w.email,
            fullName: 'Lista de Espera (Email)',
            dni: '—',
            phone: '—',
            position: undefined,
            membershipTier: 'waitlist' as const,
            googleLinked: Boolean(w.googleLinked || w.google_linked),
            // Convertido = pagó al menos una experiencia / envió comprobante
            converted: Boolean(w.converted || w.paymentsCount > 0),
            experiencesWishlist: [],
            createdAt: w.createdAt || w.created_at || new Date().toISOString(),
          }));

          const combined = [...socios, ...waitlist];
          this._members.set(combined);
          this.persistMembers(combined);
          this._lastRefreshedAt.set(new Date().toLocaleTimeString('es-AR'));
          this._isLoadingMembers.set(false);
          return;
        }

        // 2. Fallback de consultas directas a las tablas public.socios y public.waitlist
        const [sociosRes, waitlistRes, paidRows] = await Promise.all([
          this.supabase.from('socios').select('*').order('position', { ascending: true }),
          this.supabase.from('waitlist').select('*').order('created_at', { ascending: false }),
          this.supabase.from('pagos_transferencias' as any).select('email'),
        ]);

        const paidEmailSet = new Set(
          (paidRows.data || []).map((p: any) => p.email?.toLowerCase().trim()),
        );

        const sociosMap = new Map<string, any>();
        const sociosList: AdminMember[] = (sociosRes.data || []).map((s: any) => {
          const cleanEmail = s.email?.toLowerCase().trim();
          sociosMap.set(cleanEmail, s);
          const hasPayment = paidEmailSet.has(cleanEmail);
          return {
            id: s.id,
            type: 'socio' as const,
            email: s.email,
            fullName: s.full_name,
            dni: s.dni,
            phone: s.phone,
            position: s.position,
            membershipTier: s.membership_tier || 'emergente',
            googleLinked: Boolean(s.google_linked || s.auth_user_id),
            converted: hasPayment,
            experiencesWishlist: Array.isArray(s.experiences_wishlist) ? s.experiences_wishlist : [],
            experiencesOther: s.experiences_other,
            createdAt: s.created_at,
          };
        });

        const waitlistOnly: AdminMember[] = (waitlistRes.data || [])
          .filter((w: any) => !sociosMap.has(w.email?.toLowerCase().trim()))
          .map((w: any) => {
            const cleanEmail = w.email?.toLowerCase().trim();
            const isGoogle = Boolean(w.google_linked);
            const hasPayment = Boolean(w.converted) || paidEmailSet.has(cleanEmail);
            return {
              id: w.id,
              type: 'waitlist' as const,
              email: w.email,
              fullName: 'Lista de Espera (Email)',
              dni: '—',
              phone: '—',
              position: undefined,
              membershipTier: 'waitlist' as const,
              googleLinked: isGoogle,
              converted: hasPayment,
              experiencesWishlist: [],
              createdAt: w.created_at,
            };
          });

        const combined = [...sociosList, ...waitlistOnly];
        // Cuando Supabase está configurado, la fuente de la verdad es Supabase
        this._members.set(combined);
        this.persistMembers(combined);
        this._lastRefreshedAt.set(new Date().toLocaleTimeString('es-AR'));
        this._isLoadingMembers.set(false);
        return;
      }
    } catch (err) {
      console.warn('[AdminStore] Error cargando socios desde Supabase:', err);
    }

    // 3. Respaldo local si no hay conexión a Supabase o falla la red
    const stored = this.loadStoredMembers();
    if (stored && stored.length > 0) {
      this._members.set(stored);
    } else {
      const local = this.generateSampleMembers();
      this._members.set(local);
    }
    this._lastRefreshedAt.set(new Date().toLocaleTimeString('es-AR'));
    this._isLoadingMembers.set(false);
  }

  // ============================================================
  // GESTIÓN DE COMPROBANTES DE PAGO ENVIADOS
  // ============================================================

  async loadAllSubmissions(): Promise<void> {
    this._isLoadingSubmissions.set(true);

    try {
      if (isSupabaseConfigured()) {
        // 1. Intentar RPC get_admin_all_submissions
        const { data: rpcData, error: rpcErr } = await this.supabase.rpc('get_admin_all_submissions' as any);

        if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
          const subs: TransferSubmission[] = rpcData.map((p: any) => ({
            id: p.id,
            reference: p.reference,
            experienceId: p.experienceId || p.experience_id,
            experienceTitle: p.experienceTitle || p.experience_title,
            date: p.date,
            participants: p.participants,
            amountArs: p.amountArs || p.amount_ars,
            discountCode: p.discountCode || p.discount_code,
            discountArs: p.discountArs || p.discount_ars,
            fullName: p.fullName || p.full_name,
            email: p.email,
            dni: p.dni,
            phone: p.phone,
            receipt: p.receipt || {
              fileName: p.receipt_file_name || 'comprobante.png',
              mimeType: p.receipt_mime_type || 'image/png',
              sizeBytes: p.receipt_size_bytes || 1,
              url: p.receipt_url || '/assets/images/comprobante-ejemplo.png',
            },
            status: p.status || 'pendiente',
            rejectionReason: p.rejectionReason || p.rejection_reason,
            submittedAt: p.submittedAt || p.submitted_at || new Date().toISOString(),
            reviewedAt: p.reviewedAt || p.reviewed_at,
          }));

          this._submissions.set(subs);
          this._isLoadingSubmissions.set(false);
          return;
        }

        // 2. Consulta directa a public.pagos_transferencias
        const { data: tableData, error: tableErr } = await this.supabase
          .from('pagos_transferencias' as any)
          .select('*')
          .order('submitted_at', { ascending: false });

        if (!tableErr && Array.isArray(tableData) && tableData.length > 0) {
          const mapped: TransferSubmission[] = tableData.map((p: any) => ({
            id: p.id,
            reference: p.reference,
            experienceId: p.experience_id,
            experienceTitle: p.experience_title,
            date: p.date,
            participants: p.participants,
            amountArs: p.amount_ars,
            discountCode: p.discount_code,
            discountArs: p.discount_ars,
            fullName: p.full_name,
            email: p.email,
            dni: p.dni,
            phone: p.phone,
            receipt: {
              fileName: p.receipt_file_name || 'comprobante',
              mimeType: p.receipt_mime_type || 'image/jpeg',
              sizeBytes: p.receipt_size_bytes || 1,
              url: p.receipt_url,
              storageKey: p.receipt_storage_key,
              provider: p.receipt_storage_provider,
            },
            status: p.status,
            rejectionReason: p.rejection_reason,
            submittedAt: p.submitted_at,
            reviewedAt: p.reviewed_at,
          }));

          this._submissions.set(mapped);
          this._isLoadingSubmissions.set(false);
          return;
        }
      }
    } catch (err) {
      console.warn('[AdminStore] Error cargando comprobantes desde Supabase:', err);
    }

    // 3. Respaldo unificado con las submissions de ProviderStore
    const providerSubs = this.providerStore.submissions();
    if (providerSubs.length > 0) {
      this._submissions.set(providerSubs);
    } else {
      this._submissions.set(this.generateSampleSubmissions());
    }
    this._isLoadingSubmissions.set(false);
  }

  async reviewSubmission(
    submissionId: string,
    status: Exclude<TransferStatus, 'pendiente'>,
    rejectionReason?: string,
  ): Promise<boolean> {
    try {
      if (isSupabaseConfigured()) {
        const { error } = await this.supabase.rpc('review_transfer_submission' as any, {
          p_submission_id: submissionId,
          p_status: status,
          p_rejection_reason: status === 'rechazado' ? rejectionReason : null,
        });

        if (error) {
          await this.supabase
            .from('pagos_transferencias' as any)
            .update({
              status,
              rejection_reason: status === 'rechazado' ? rejectionReason : null,
              reviewed_at: new Date().toISOString(),
            })
            .eq('id', submissionId);
        }
      }
    } catch (err) {
      console.warn('[AdminStore] Error al revisar comprobante en Supabase:', err);
    }

    // Actualizar signal localmente
    this._submissions.update((list) =>
      list.map((s) =>
        s.id === submissionId
          ? {
              ...s,
              status,
              rejectionReason: status === 'rechazado' ? rejectionReason : undefined,
              reviewedAt: new Date().toISOString(),
            }
          : s,
      ),
    );

    // Si se aprueba, actualizar al socio a "activo" en la lista de miembros
    if (status === 'aprobado') {
      const targetSub = this._submissions().find((s) => s.id === submissionId);
      if (targetSub) {
        this._members.update((list) =>
          list.map((m) =>
            m.email.toLowerCase() === targetSub.email.toLowerCase() && m.membershipTier === 'emergente'
              ? { ...m, membershipTier: 'activo' }
              : m,
          ),
        );
      }
    }

    return true;
  }

  // ============================================================
  // GESTIÓN DE POSTULACIONES (PRESTADORES & SOCIOS FUNDADORES)
  // ============================================================

  async loadAllApplications(): Promise<void> {
    this._isLoadingApplications.set(true);

    try {
      if (isSupabaseConfigured()) {
        const [prestadoresRes, fundadoresRes] = await Promise.all([
          this.supabase
            .from('postulaciones_prestadores' as any)
            .select('*')
            .order('created_at', { ascending: false }),
          this.supabase
            .from('postulaciones_fundadores' as any)
            .select('*')
            .order('created_at', { ascending: false }),
        ]);

        const prestadores: AdminApplication[] = (prestadoresRes.data || []).map((p: any) => ({
          id: p.id,
          type: 'prestador' as const,
          fullName: p.full_name || 'Sin nombre',
          email: p.email,
          phone: p.phone || '—',
          category: p.category || 'guia_montaña',
          region: p.region || 'Puna & Fiambalá',
          website: p.website || '',
          description: p.description || '',
          status: p.status === 'aprobado' ? 'aprobado' : p.status === 'rechazado' ? 'rechazado' : 'pendiente',
          createdAt: p.created_at || new Date().toISOString(),
        }));

        const fundadores: AdminApplication[] = (fundadoresRes.data || []).map((f: any) => ({
          id: f.id,
          type: 'fundador' as const,
          fullName: f.full_name || 'Sin nombre',
          email: f.email,
          phone: f.phone || '—',
          motivationLetter: f.motivation_letter || '',
          status: (f.status === 'aprobada' || f.status === 'aprobado')
            ? 'aprobado'
            : (f.status === 'rechazada' || f.status === 'rechazado')
            ? 'rechazado'
            : 'pendiente',
          createdAt: f.created_at || new Date().toISOString(),
        }));

        const combined = [...prestadores, ...fundadores].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        this._applications.set(combined);
        this.persistApplications(combined);
        this._isLoadingApplications.set(false);
        return;
      }
    } catch (err) {
      console.warn('[AdminStore] Error cargando postulaciones desde Supabase:', err);
    }

    const stored = this.loadStoredApplications();
    if (stored && stored.length > 0) {
      this._applications.set(stored);
    } else {
      const sample = this.generateSampleApplications();
      this._applications.set(sample);
    }
    this._isLoadingApplications.set(false);
  }

  async updateApplicationStatus(
    id: string,
    type: ApplicationType,
    status: ApplicationStatus,
  ): Promise<boolean> {
    try {
      if (isSupabaseConfigured()) {
        const table = type === 'prestador' ? 'postulaciones_prestadores' : 'postulaciones_fundadores';
        const dbStatus = type === 'fundador'
          ? (status === 'aprobado' ? 'aprobada' : status === 'rechazado' ? 'rechazada' : 'en_evaluacion')
          : status;

        await this.supabase
          .from(table as any)
          .update({
            status: dbStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      }
    } catch (err) {
      console.warn('[AdminStore] Error actualizando estado de postulación en Supabase:', err);
    }

    this._applications.update((list) =>
      list.map((a) => (a.id === id ? { ...a, status } : a)),
    );
    this.persistApplications(this._applications());
    return true;
  }

  private persistApplications(apps: AdminApplication[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.adminApplicationsCache, JSON.stringify(apps));
    } catch {
      // ignore
    }
  }

  private loadStoredApplications(): AdminApplication[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.adminApplicationsCache);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private generateSampleApplications(): AdminApplication[] {
    return [
      {
        id: 'post-1',
        type: 'prestador',
        fullName: 'Esteban Carrizo (Catamarca 4x4)',
        email: 'esteban.guias@catamarca4x4.com',
        phone: '+54 383 490 2211',
        category: 'transporte_4x4',
        region: 'Puna & Fiambalá',
        website: 'https://catamarca4x4.com',
        description: 'Flota de 3 camionetas Toyota Hilux 4x4 equipadas para alta montaña, rescate, tubo de oxígeno y comunicaciones VHF/Satelital.',
        status: 'pendiente',
        createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      },
      {
        id: 'post-2',
        type: 'fundador',
        fullName: 'Mariana Zavaleta',
        email: 'mariana.zavaleta@fundacion.org',
        phone: '+54 11 4455 8899',
        motivationLetter: 'Deseo sumarme al cuadro fundacional para colaborar con la preservación arqueológica de los valles del Shincal y respaldar expediciones de impacto ecológico positivo.',
        status: 'pendiente',
        createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
      },
      {
        id: 'post-3',
        type: 'prestador',
        fullName: 'Ignacio Jalil (Travesías Náuticas)',
        email: 'ignacio@jumealkayak.com.ar',
        phone: '+54 383 455 8820',
        category: 'kayak_nautica',
        region: 'San Fernando del Valle',
        website: 'https://instagram.com/jumealkayak',
        description: 'Guía habilitado de kayak y SUP con 12 embarcaciones completas, chalecos certificados y lancha de apoyo en el dique El Jumeal.',
        status: 'aprobado',
        createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
      },
    ];
  }

  // ============================================================
  // UTILIDADES DE EXPORTACIÓN
  // ============================================================

  generateMembersRosterText(): string {
    const list = this._members();
    const rows = [
      ['Nro Socio', 'Tipo', 'Nombre y Apellido', 'DNI', 'Email', 'Teléfono', 'Nivel', 'Google Vinculado', 'Convertido', 'Fecha Alta'].join('\t'),
      ...list.map((m) =>
        [
          m.position ? `#${m.position}` : 'Waitlist',
          m.type === 'socio' ? 'Oficial' : 'Lista Espera',
          m.fullName || '—',
          m.dni || '—',
          m.email,
          m.phone || '—',
          m.membershipTier.toUpperCase(),
          m.googleLinked ? 'SÍ' : 'NO',
          m.converted ? 'SÍ' : 'NO',
          new Date(m.createdAt).toLocaleDateString('es-AR'),
        ].join('\t'),
      ),
    ];
    return rows.join('\n');
  }

  // ============================================================
  // PERSISTENCIA Y MOCKS
  // ============================================================

  private persistMembers(members: AdminMember[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.adminMembersCache, JSON.stringify(members));
    } catch {
      // ignore
    }
  }

  private loadStoredMembers(): AdminMember[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.adminMembersCache);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private generateSampleMembers(): AdminMember[] {
    return [
      {
        id: 'soc-100',
        type: 'socio',
        email: 'gonzagramaglia@gmail.com',
        fullName: 'Gonzalo Gramaglia',
        dni: '35120988',
        phone: '+54 383 455 1290',
        position: 100,
        membershipTier: 'fundador',
        googleLinked: true,
        converted: true,
        experiencesWishlist: ['kayak', 'seismiles', 'pomez'],
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      },
      {
        id: 'soc-101',
        type: 'socio',
        email: 'lucia.fernandez@ejemplo.com',
        fullName: 'Lucía Fernández',
        dni: '32458190',
        phone: '+54 383 455 1290',
        position: 101,
        membershipTier: 'activo',
        googleLinked: true,
        converted: true,
        experiencesWishlist: ['kayak'],
        createdAt: new Date(Date.now() - 26 * 3600000).toISOString(),
      },
      {
        id: 'soc-102',
        type: 'socio',
        email: 'mquiroga@ejemplo.com',
        fullName: 'Martín Quiroga',
        dni: '28771034',
        phone: '+54 11 5021 7781',
        position: 102,
        membershipTier: 'emergente',
        googleLinked: false,
        converted: true,
        experiencesWishlist: ['pomez', 'campo_galan'],
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        id: 'wl-201',
        type: 'waitlist',
        email: 'sofia.valle@gmail.com',
        fullName: 'Lista de Espera (Email)',
        membershipTier: 'waitlist',
        googleLinked: true,
        converted: false, // Vinculó Google pero aún no pagó experiencia
        experiencesWishlist: [],
        createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
      {
        id: 'wl-202',
        type: 'waitlist',
        email: 'marcelo.alvarez@outlook.com',
        fullName: 'Lista de Espera (Email)',
        membershipTier: 'waitlist',
        googleLinked: false,
        converted: false,
        experiencesWishlist: [],
        createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      },
      {
        id: 'wl-203',
        type: 'waitlist',
        email: 'carolina.perez@gmail.com',
        fullName: 'Lista de Espera (Email)',
        membershipTier: 'waitlist',
        googleLinked: true,
        converted: false,
        experiencesWishlist: [],
        createdAt: new Date(Date.now() - 18 * 86400000).toISOString(),
      },
    ];
  }

  private generateSampleSubmissions(): TransferSubmission[] {
    return [
      {
        id: 'sub-1',
        reference: 'KAY-4F7Q',
        experienceId: 'exp-kayak',
        experienceTitle: 'Travesía en Kayak & Sunset en Las Pirquitas',
        date: '2026-11-08',
        participants: 2,
        amountArs: 130000,
        fullName: 'Lucía Fernández',
        email: 'lucia.fernandez@ejemplo.com',
        dni: '32458190',
        phone: '+54 383 455 1290',
        receipt: {
          fileName: 'transferencia-lucia.png',
          mimeType: 'image/png',
          sizeBytes: 412_000,
          url: '/assets/images/comprobante-ejemplo.png',
        },
        status: 'pendiente',
        submittedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      },
      {
        id: 'sub-2',
        reference: 'KAY-9M2D',
        experienceId: 'exp-kayak',
        experienceTitle: 'Travesía en Kayak & Sunset en Las Pirquitas',
        date: '2026-11-08',
        participants: 1,
        amountArs: 65000,
        fullName: 'Martín Quiroga',
        email: 'mquiroga@ejemplo.com',
        dni: '28771034',
        phone: '+54 11 5021 7781',
        receipt: {
          fileName: 'comprobante-martin.png',
          mimeType: 'image/png',
          sizeBytes: 388_000,
          url: '/assets/images/comprobante-ejemplo.png',
        },
        status: 'aprobado',
        submittedAt: new Date(Date.now() - 20 * 3600000).toISOString(),
        reviewedAt: new Date(Date.now() - 18 * 3600000).toISOString(),
      },
      {
        id: 'sub-3',
        reference: 'KAY-2X8B',
        experienceId: 'exp-kayak',
        experienceTitle: 'Travesía en Kayak & Sunset en Las Pirquitas',
        date: '2026-11-15',
        participants: 3,
        amountArs: 195000,
        fullName: 'Carla Ahumada',
        email: 'carla.ahumada@ejemplo.com',
        dni: '35120988',
        phone: '+54 383 412 0033',
        receipt: {
          fileName: 'pago-kayak.png',
          mimeType: 'image/png',
          sizeBytes: 401_000,
          url: '/assets/images/comprobante-ejemplo.png',
        },
        status: 'aprobado',
        submittedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        reviewedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
      },
    ];
  }
}


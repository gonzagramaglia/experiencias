import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MAX_PARTICIPANTS_PER_BOOKING,
  NewProviderExperience,
  NewTransferSubmission,
  ProviderExperience,
  ProviderUser,
  RECEIPT_ACCEPTED_TYPES,
  RECEIPT_MAX_BYTES,
  TransferStatus,
  TransferSubmission,
  discountAmount,
  findDiscountCode,
} from '../models/bank-transfer.model';
import { TransactionalEmailService } from './transactional-email.service';
import { NewsletterService } from './newsletter.service';
import { ActivityHistoryService } from './activity-history.service';
import { SUPABASE_CLIENT, isSupabaseConfigured } from '../supabase/supabase.client';

const PROVIDER_CONTACT_EMAIL = 'prestadores@experiencias.club';
const SAMPLE_RECEIPT_URL = '/assets/images/comprobante-ejemplo.png';

const STORAGE_KEYS = {
  experiences: 'catamarca_provider_experiences_v5',
  submissions: 'catamarca_provider_submissions_v5',
  session: 'catamarca_provider_session_v5',
  providers: 'catamarca_providers_registry_v5',
};

function upcomingDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateReceiptFile(file: File): string | null {
  if (!(RECEIPT_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return 'Formato no admitido. Subí una imagen (JPG, PNG, WEBP) o un PDF.';
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return 'El archivo supera los 5 MB.';
  }
  return null;
}

export const SEED_PROVIDERS: ProviderUser[] = [
  {
    id: 'prov-patricio',
    email: 'patricio@experiencias.club',
    name: 'Patricio Facundo Diaz Tillar',
    agency: 'Catamarca Kayak & Aventura Náutica',
    phone: '+54 383 455 8812',
    cuitDni: '20-30456123-4',
    cbuAlias: '3840200500000056402423',
    bankName: 'Uala Bank S.A.U',
    verified: true,
    role: 'prestador',
    avatar: '/assets/aistudio/patricio.jpg',
    joinedAt: '2024-03-15T10:00:00Z',
  },
  {
    id: 'prov-marcos',
    email: 'puna@experiencias.club',
    name: 'Marcos Albarracín',
    agency: 'Expediciones Puna Secreta 4x4',
    phone: '+54 383 499 3301',
    cuitDni: '20-28114920-7',
    cbuAlias: 'PUNA.EXPEDICIONES',
    bankName: 'Banco Galicia',
    verified: true,
    role: 'prestador',
    avatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    joinedAt: '2024-06-20T14:30:00Z',
  },
];

const KAYAK_ID = 'exp-kayak';
const POMEZ_ID = 'exp-pomez-4x4';

const SEED_EXPERIENCES: ProviderExperience[] = [
  {
    id: KAYAK_ID,
    slug: 'kayak',
    title: 'Travesía en Kayak & Sunset en El Jumeal',
    shortTitle: 'Travesía en Kayak',
    tagline: 'Remada guiada al atardecer con brindis de productos catamarqueños.',
    description:
      'Remada guiada en kayak en aguas calmas rodeadas de quebradas y vegetación de yungas andinas. Presenciamos la caída del sol reflejada en el dique y cerramos con un brindis.',
    region: 'Valle Central y Ambato',
    meetingPoint: 'Club Náutico Dique El Jumeal',
    difficulty: 'Baja',
    durationLabel: '4 horas',
    priceArs: 65000,
    capacityPerDate: 12,
    dates: [upcomingDate(9), upcomingDate(16), upcomingDate(23)],
    status: 'publicada',
    providerId: 'prov-patricio',
    providerName: 'Patricio Facundo · Catamarca Kayak & Aventura Náutica',
    coverImage: '/assets/images/kayak-club-de-experiencias.jpg',
    createdAt: hoursAgo(24 * 30),
  },
  {
    id: POMEZ_ID,
    slug: 'campo-de-piedra-pomez',
    title: 'Expedición 4x4 Campo de Piedra Pómez & Volcanes',
    shortTitle: 'Piedra Pómez 4x4',
    tagline: 'Aventura lunar en el laberinto blanco de la Puna catamarqueña a más de 3.000 msnm.',
    description:
      'Travesía en camionetas 4x4 equipadas hacia el majestuoso Campo de Piedra Pómez. Incluye cruce de médanos gigantes, avistaje de vicuñas en Laguna Blanca y merienda andina en el silencio absoluto de la cordillera.',
    region: 'Puna de Atacama',
    meetingPoint: 'Plaza Principal de El Peñón, Antofagasta de la Sierra',
    difficulty: 'Moderada',
    durationLabel: 'Día completo (10 h)',
    priceArs: 145000,
    capacityPerDate: 8,
    dates: [upcomingDate(12), upcomingDate(26)],
    status: 'borrador',
    providerId: 'prov-claudio',
    providerName: 'Catamarca Kayak & Aventura Náutica',
    coverImage: '/assets/images/catamarca_pomez.jpg',
    createdAt: hoursAgo(24 * 5),
  },
];

const SEED_SUBMISSIONS: TransferSubmission[] = [
  {
    id: 'sub-1',
    reference: 'KAY-4F7Q',
    experienceId: KAYAK_ID,
    experienceTitle: SEED_EXPERIENCES[0].title,
    date: SEED_EXPERIENCES[0].dates[0],
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
      url: SAMPLE_RECEIPT_URL,
    },
    status: 'pendiente',
    submittedAt: hoursAgo(3),
  },
  {
    id: 'sub-2',
    reference: 'KAY-9M2D',
    experienceId: KAYAK_ID,
    experienceTitle: SEED_EXPERIENCES[0].title,
    date: SEED_EXPERIENCES[0].dates[0],
    participants: 1,
    amountArs: 65000,
    fullName: 'Martín Quiroga',
    email: 'mquiroga@ejemplo.com',
    dni: '28771034',
    phone: '+54 11 5021 7781',
    receipt: {
      fileName: 'comprobante.png',
      mimeType: 'image/png',
      sizeBytes: 388_000,
      url: SAMPLE_RECEIPT_URL,
    },
    status: 'pendiente',
    submittedAt: hoursAgo(20),
  },
  {
    id: 'sub-3',
    reference: 'KAY-2X8B',
    experienceId: KAYAK_ID,
    experienceTitle: SEED_EXPERIENCES[0].title,
    date: SEED_EXPERIENCES[0].dates[1],
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
      url: SAMPLE_RECEIPT_URL,
    },
    status: 'aprobado',
    submittedAt: hoursAgo(52),
    reviewedAt: hoursAgo(48),
  },
];

@Injectable({ providedIn: 'root' })
export class ProviderStoreService {
  private readonly emails = inject(TransactionalEmailService);
  private readonly newsletter = inject(NewsletterService);
  private readonly activities = inject(ActivityHistoryService);
  private readonly supabase = inject(SUPABASE_CLIENT);

  private readonly _providers = signal<ProviderUser[]>(this.loadStoredProviders());
  private readonly _currentProvider = signal<ProviderUser | null>(
    isSupabaseConfigured() ? null : SEED_PROVIDERS[0],
  );
  private readonly _experiences = signal<ProviderExperience[]>(this.loadStoredExperiences());
  private readonly _submissions = signal<TransferSubmission[]>(this.loadStoredSubmissions());

  // Public readonly signals
  readonly currentProvider = this._currentProvider.asReadonly();
  readonly isAuthenticated = computed(() => this._currentProvider() !== null);
  readonly allProviders = this._providers.asReadonly();
  readonly experiences = this._experiences.asReadonly();
  readonly submissions = computed(() =>
    [...this._submissions()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  );

  // Submissions filtered for current logged-in provider
  readonly providerSubmissions = computed(() => {
    const provider = this._currentProvider();
    if (!provider) return this.submissions();
    const providerExpIds = new Set(
      this._experiences()
        .filter((e) => e.providerId === provider.id)
        .map((e) => e.id),
    );
    return this.submissions().filter((s) => providerExpIds.has(s.experienceId));
  });

  // Experiences for current logged-in provider
  readonly providerExperiences = computed(() => {
    const provider = this._currentProvider();
    if (!provider) return this._experiences();
    return this._experiences().filter((e) => e.providerId === provider.id);
  });

  readonly pendingCount = computed(
    () => this.providerSubmissions().filter((s) => s.status === 'pendiente').length,
  );

  // Financial KPIs for provider dashboard
  readonly providerStats = computed(() => {
    const subs = this.providerSubmissions();
    const exps = this.providerExperiences();

    const confirmedRevenue = subs
      .filter((s) => s.status === 'aprobado')
      .reduce((sum, s) => sum + s.amountArs, 0);

    const pendingRevenue = subs
      .filter((s) => s.status === 'pendiente')
      .reduce((sum, s) => sum + s.amountArs, 0);

    const totalEnrolled = subs
      .filter((s) => s.status !== 'rechazado')
      .reduce((sum, s) => sum + s.participants, 0);

    const publishedCount = exps.filter((e) => e.status === 'publicada').length;
    const pendingModerationCount = exps.filter(
      (e) =>
        e.status === 'pendiente_publicacion' ||
        e.status === 'pendiente_ocultar' ||
        e.status === 'pendiente_eliminar',
    ).length;

    return {
      confirmedRevenue,
      pendingRevenue,
      totalEnrolled,
      publishedCount,
      pendingModerationCount,
      totalExperiences: exps.length,
      pendingReceiptsCount: subs.filter((s) => s.status === 'pendiente').length,
    };
  });

  async restoreSupabaseSession(): Promise<void> {
    if (!isSupabaseConfigured()) {
      this._currentProvider.set(SEED_PROVIDERS[0]);
      this.saveSession(SEED_PROVIDERS[0]);
      return;
    }

    const { data } = await this.supabase.auth.getUser();
    const email = data.user?.email?.trim().toLowerCase();
    if (!email) {
      this._currentProvider.set(null);
      return;
    }

    const { data: access, error } = await this.supabase
      .from('provider_access')
      .select('email, name, agency, active')
      .eq('email', email)
      .eq('active', true)
      .maybeSingle();

    if (error || !access) {
      this._currentProvider.set(null);
      return;
    }

    const existing = this._providers().find((provider) => provider.email.toLowerCase() === email);
    const provider: ProviderUser = existing ?? {
      id: `provider-${email.replace(/[^a-z0-9]+/g, '-')}`,
      email,
      name: access.name || email,
      agency: access.agency || 'Prestador EXPERIENCIAS.CLUB',
      phone: '',
      cuitDni: '',
      cbuAlias: '',
      bankName: '',
      verified: true,
      role: 'prestador',
      joinedAt: new Date().toISOString(),
    };

    if (!existing) this._providers.update((providers) => [...providers, provider]);
    this._currentProvider.set(provider);
    this.saveSession(provider);
  }

  async signInWithGoogle(): Promise<{ success: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      this._currentProvider.set(SEED_PROVIDERS[0]);
      this.saveSession(SEED_PROVIDERS[0]);
      return { success: true, message: '' };
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://prestadores.experiencias.club';
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/dashboard` },
    });

    return error
      ? { success: false, message: error.message }
      : { success: true, message: 'Redirigiendo a Google...' };
  }

  // ==========================================
  // Auth & Session
  // ==========================================
  login(email: string, _password?: string): boolean {
    const normalized = email.trim().toLowerCase();
    let provider = this._providers().find((p) => p.email.toLowerCase() === normalized);

    if (!provider) {
      // Auto-register demo profile for easy testing with any email
      const name = normalized.split('@')[0].replace(/[._]/g, ' ');
      provider = {
        id: `prov-${crypto.randomUUID().slice(0, 8)}`,
        email: normalized,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        agency: `${name.toUpperCase()} Turismo Aventura`,
        phone: '+54 383 400 0000',
        cuitDni: '20-30000000-9',
        cbuAlias: 'PRESTADOR.CATAMARCA',
        bankName: 'Banco de Catamarca',
        verified: false,
        role: 'prestador',
        avatar:
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
        joinedAt: new Date().toISOString(),
      };
      this._providers.update((list) => [...list, provider!]);
      this.saveProviders();
    }

    this._currentProvider.set(provider);
    this.saveSession(provider);
    return true;
  }

  loginAs(providerId: string): void {
    const provider = this._providers().find((p) => p.id === providerId);
    if (provider) {
      this._currentProvider.set(provider);
      this.saveSession(provider);
    }
  }

  register(data: {
    email: string;
    name: string;
    agency: string;
    phone: string;
    cuitDni: string;
    cbuAlias: string;
    bankName: string;
  }): ProviderUser {
    const newUser: ProviderUser = {
      id: `prov-${crypto.randomUUID().slice(0, 8)}`,
      email: data.email.trim().toLowerCase(),
      name: data.name.trim(),
      agency: data.agency.trim(),
      phone: data.phone.trim(),
      cuitDni: data.cuitDni.trim(),
      cbuAlias: data.cbuAlias.trim(),
      bankName: data.bankName.trim(),
      verified: false,
      role: 'prestador',
      avatar:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
      joinedAt: new Date().toISOString(),
    };

    this._providers.update((list) => [newUser, ...list]);
    this.saveProviders();
    this._currentProvider.set(newUser);
    this.saveSession(newUser);
    return newUser;
  }

  async logout(): Promise<void> {
    if (isSupabaseConfigured()) {
      await this.supabase.auth.signOut();
    }
    this._currentProvider.set(null);
    this.saveSession(null);
  }

  updateProfile(updates: Partial<ProviderUser>): void {
    const current = this._currentProvider();
    if (!current) return;
    const updated = { ...current, ...updates };
    this._currentProvider.set(updated);
    this._providers.update((list) => list.map((p) => (p.id === current.id ? updated : p)));
    this.saveSession(updated);
    this.saveProviders();
  }

  // ==========================================
  // Experience Management & Moderation
  // ==========================================
  getExperienceById(id: string): ProviderExperience | undefined {
    return this._experiences().find((e) => e.id === id);
  }

  getExperienceBySlug(slug: string): ProviderExperience | undefined {
    return this._experiences().find((e) => e.slug === slug);
  }

  reservedSeats(experienceId: string, date: string): number {
    return this._submissions()
      .filter((s) => s.experienceId === experienceId && s.date === date && s.status !== 'rechazado')
      .reduce((total, s) => total + s.participants, 0);
  }

  availableSeats(experience: ProviderExperience, date: string): number {
    return Math.max(0, experience.capacityPerDate - this.reservedSeats(experience.id, date));
  }

  submissionsFor(experienceId: string): TransferSubmission[] {
    return this._submissions().filter((s) => s.experienceId === experienceId);
  }

  totalEnrolledInExperience(experienceId: string): number {
    return this._submissions()
      .filter((s) => s.experienceId === experienceId && s.status !== 'rechazado')
      .reduce((total, s) => total + s.participants, 0);
  }

  canDeleteExperience(experienceId: string): {
    allowed: boolean;
    reason?: string;
    enrolledCount: number;
  } {
    const submissions = this.submissionsFor(experienceId);
    const nonRejected = submissions.filter((s) => s.status !== 'rechazado');
    const enrolledCount = nonRejected.reduce((sum, s) => sum + s.participants, 0);

    if (submissions.length > 0 || enrolledCount > 0) {
      return {
        allowed: false,
        enrolledCount,
        reason: `No podés eliminar esta experiencia porque cuenta con ${enrolledCount} socio(s) inscripto(s) o pagos registrados. Si no deseás recibir más reservas, podés solicitar ocultarla.`,
      };
    }
    return { allowed: true, enrolledCount: 0 };
  }

  createExperience(input: NewProviderExperience, requestPublication = false): ProviderExperience {
    const provider = this._currentProvider() || SEED_PROVIDERS[0];
    const baseSlug = slugify(input.title) || 'experiencia';
    let slug = baseSlug;
    let suffix = 2;
    while (this._experiences().some((e) => e.slug === slug)) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const experience: ProviderExperience = {
      ...input,
      id: `exp-${crypto.randomUUID()}`,
      slug,
      providerId: provider.id,
      providerName: provider.agency || provider.name,
      dates: [...input.dates].sort(),
      status: requestPublication ? 'pendiente_publicacion' : 'borrador',
      moderation: requestPublication
        ? {
            action: 'publicar',
            requestedAt: new Date().toISOString(),
            status: 'pendiente',
          }
        : undefined,
      coverImage: input.coverImage || '/assets/images/laguna_blanca.jpg',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this._experiences.update((list) => [experience, ...list]);
    this.saveExperiences();
    return experience;
  }

  updateExperience(
    id: string,
    updates: Partial<Omit<ProviderExperience, 'id' | 'createdAt' | 'providerId'>>,
  ): ProviderExperience {
    let updatedExperience: ProviderExperience | undefined;
    this._experiences.update((list) =>
      list.map((e) => {
        if (e.id !== id) return e;
        updatedExperience = {
          ...e,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        return updatedExperience;
      }),
    );

    if (!updatedExperience) {
      throw new Error('Experiencia no encontrada.');
    }

    this.saveExperiences();
    return updatedExperience;
  }

  /**
   * Request Publication: Prestador requests the admin to review and publish the experience
   */
  requestPublish(experienceId: string): void {
    const experience = this.getExperienceById(experienceId);
    if (!experience) return;
    if (experience.dates.length === 0) {
      throw new Error('Debés cargar al menos una fecha futura antes de solicitar publicación.');
    }

    this._experiences.update((list) =>
      list.map((e) =>
        e.id === experienceId
          ? {
              ...e,
              status: 'pendiente_publicacion',
              moderation: {
                action: 'publicar',
                requestedAt: new Date().toISOString(),
                status: 'pendiente',
              },
              updatedAt: new Date().toISOString(),
            }
          : e,
      ),
    );
    this.saveExperiences();
  }

  /**
   * Request Hide: Prestador requests the admin to hide/pause a published experience
   */
  requestHide(experienceId: string, reason?: string): void {
    this._experiences.update((list) =>
      list.map((e) =>
        e.id === experienceId
          ? {
              ...e,
              status: 'pendiente_ocultar',
              moderation: {
                action: 'ocultar',
                requestedAt: new Date().toISOString(),
                reason: reason?.trim(),
                status: 'pendiente',
              },
              updatedAt: new Date().toISOString(),
            }
          : e,
      ),
    );
    this.saveExperiences();
  }

  /**
   * Request Delete: Only allowed if 0 people are enrolled
   */
  requestDelete(experienceId: string, reason?: string): void {
    const check = this.canDeleteExperience(experienceId);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    this._experiences.update((list) =>
      list.map((e) =>
        e.id === experienceId
          ? {
              ...e,
              status: 'pendiente_eliminar',
              moderation: {
                action: 'eliminar',
                requestedAt: new Date().toISOString(),
                reason: reason?.trim(),
                status: 'pendiente',
              },
              updatedAt: new Date().toISOString(),
            }
          : e,
      ),
    );
    this.saveExperiences();
  }

  /**
   * Set status directly (backward compatibility)
   */
  setExperienceStatus(experienceId: string, status: ProviderExperience['status']): void {
    this._experiences.update((list) =>
      list.map((e) => (e.id === experienceId ? { ...e, status } : e)),
    );
    this.saveExperiences();
  }

  /**
   * Admin Moderation Simulation / Execution:
   * Approves the pending request (publish, hide, delete)
   */
  adminApproveAction(
    experienceId: string,
    adminComment = 'Aprobado por el equipo editorial',
  ): void {
    const exp = this.getExperienceById(experienceId);
    if (!exp || !exp.moderation) return;

    if (exp.moderation.action === 'eliminar') {
      // Actually remove experience
      this._experiences.update((list) => list.filter((e) => e.id !== experienceId));
      this.saveExperiences();
      return;
    }

    const newStatus = exp.moderation.action === 'publicar' ? 'publicada' : 'oculta';

    this._experiences.update((list) =>
      list.map((e) =>
        e.id === experienceId
          ? {
              ...e,
              status: newStatus,
              moderation: {
                ...e.moderation!,
                status: 'aprobada',
                reviewedAt: new Date().toISOString(),
                reviewedBy: 'Admin experiencias.club',
                adminComment,
              },
              updatedAt: new Date().toISOString(),
            }
          : e,
      ),
    );
    this.saveExperiences();
  }

  /**
   * Admin Moderation Simulation / Execution: Rejects pending request
   */
  adminRejectAction(experienceId: string, adminComment: string): void {
    this._experiences.update((list) =>
      list.map((e) => {
        if (e.id !== experienceId || !e.moderation) return e;
        // Revert to draft or published depending on action
        const revertStatus = e.moderation.action === 'publicar' ? 'borrador' : 'publicada';
        return {
          ...e,
          status: revertStatus,
          moderation: {
            ...e.moderation,
            status: 'rechazada',
            reviewedAt: new Date().toISOString(),
            reviewedBy: 'Admin experiencias.club',
            adminComment,
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    this.saveExperiences();
  }

  // ==========================================
  // Submissions & Receipts
  // ==========================================
  submitTransfer(input: NewTransferSubmission): TransferSubmission {
    const experience = this._experiences().find((e) => e.id === input.experienceId);
    if (!experience || experience.status !== 'publicada') {
      throw new Error('La experiencia no está disponible.');
    }
    if (!experience.dates.includes(input.date)) {
      throw new Error('La fecha elegida no está disponible.');
    }
    if (
      !Number.isInteger(input.participants) ||
      input.participants < 1 ||
      input.participants > MAX_PARTICIPANTS_PER_BOOKING
    ) {
      throw new Error('Cantidad de personas inválida.');
    }
    if (input.participants > this.availableSeats(experience, input.date)) {
      throw new Error('No quedan cupos suficientes para esa fecha.');
    }
    const fileError = validateReceiptFile(input.receiptFile);
    if (fileError) {
      throw new Error(fileError);
    }
    const discount = input.discountCode
      ? (findDiscountCode(input.discountCode) ??
        this.newsletter.findMemberDiscount(input.discountCode))
      : undefined;
    if (input.discountCode && !discount) {
      throw new Error('El código de descuento no es válido.');
    }
    const subtotal = experience.priceArs * input.participants;
    const discountArs = discountAmount(subtotal, discount);

    const submission: TransferSubmission = {
      id: `sub-${crypto.randomUUID()}`,
      reference: this.buildReference(experience.slug),
      experienceId: experience.id,
      experienceTitle: experience.title,
      date: input.date,
      participants: input.participants,
      amountArs: subtotal - discountArs,
      ...(discount ? { discountCode: discount.code, discountArs } : {}),
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      dni: input.dni.trim(),
      phone: input.phone.trim(),
      receipt: {
        fileName: input.receiptFile.name,
        mimeType: input.receiptFile.type,
        sizeBytes: input.receiptFile.size,
        url: URL.createObjectURL(input.receiptFile),
      },
      status: 'pendiente',
      submittedAt: new Date().toISOString(),
    };

    this._submissions.update((list) => [submission, ...list]);
    this.saveSubmissions();

    if (submission.discountCode) {
      this.newsletter.markMemberDiscountUsed(
        submission.discountCode,
        submission.reference,
        experience.title,
      );
    }
    this.recordMemberActivity(experience, submission);
    this.emails.notifyReceiptReceived(submission);
    this.emails.notifyProviderNewReceipt(submission, PROVIDER_CONTACT_EMAIL);
    return submission;
  }

  reviewSubmission(
    submissionId: string,
    status: Exclude<TransferStatus, 'pendiente'>,
    rejectionReason?: string,
  ): void {
    let reviewed: TransferSubmission | undefined;
    this._submissions.update((list) =>
      list.map((s) => {
        if (s.id !== submissionId) return s;
        reviewed = {
          ...s,
          status,
          rejectionReason:
            status === 'rechazado' ? rejectionReason?.trim() || undefined : undefined,
          reviewedAt: new Date().toISOString(),
        };
        return reviewed;
      }),
    );
    this.saveSubmissions();

    if (!reviewed) return;
    if (status === 'aprobado') {
      this.emails.notifyPaymentApproved(reviewed);
    } else {
      this.emails.notifyPaymentRejected(reviewed);
    }
  }

  private recordMemberActivity(
    experience: ProviderExperience,
    submission: TransferSubmission,
  ): void {
    const member = this.newsletter.currentMember();
    if (!member) return;
    const dateLabel = new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${submission.date}T12:00:00`));
    this.activities.addActivity({
      id: `act_${submission.id}`,
      slug: `${experience.slug}-${submission.reference.toLowerCase()}`,
      userId: member.id,
      experienceId: experience.id,
      title: experience.title,
      region: experience.region,
      altitude: experience.meetingPoint,
      coverImage: experience.coverImage || '/assets/images/laguna_blanca.jpg',
      dateLabel,
      status: 'pendiente_pago',
      provider: {
        name: experience.shortTitle ?? experience.title,
        category: experience.difficulty,
        contactPhone: '',
      },
      receipt: {
        receiptNumber: submission.reference,
        transactionId: submission.id,
        gateway: 'custom',
        gatewayDisplayName: 'Transferencia bancaria',
        amountArs: submission.amountArs,
        amountUsd: 0,
        paidAt: new Date(submission.submittedAt).toLocaleString('es-AR'),
        paymentMethodSummary: 'Transferencia a CBU · comprobante en revisión',
        payerEmail: submission.email,
        payerName: submission.fullName,
        authCode: submission.reference,
        status: 'pendiente_verificacion',
        ...(submission.discountCode
          ? { discountCode: submission.discountCode, discountArs: submission.discountArs }
          : {}),
      },
      memoriesCount: 0,
      memoryPhotos: [],
    });
  }

  private buildReference(slug: string): string {
    const prefix = slug.replace(/-/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const random = crypto.getRandomValues(new Uint32Array(4));
    const code = Array.from(random, (n) => alphabet[n % alphabet.length]).join('');
    return `${prefix}-${code}`;
  }

  // ==========================================
  // Persistence Helpers
  // ==========================================
  private loadStoredProviders(): ProviderUser[] {
    if (typeof window === 'undefined') return SEED_PROVIDERS;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.providers);
      return raw ? JSON.parse(raw) : SEED_PROVIDERS;
    } catch {
      return SEED_PROVIDERS;
    }
  }

  private loadStoredSession(): ProviderUser | null {
    if (typeof window === 'undefined') return SEED_PROVIDERS[0];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.session);
      return raw ? JSON.parse(raw) : SEED_PROVIDERS[0]; // Default logged in as Claudio for preview convenience
    } catch {
      return SEED_PROVIDERS[0];
    }
  }

  private loadStoredExperiences(): ProviderExperience[] {
    if (typeof window === 'undefined') return SEED_EXPERIENCES;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.experiences);
      return raw ? JSON.parse(raw) : SEED_EXPERIENCES;
    } catch {
      return SEED_EXPERIENCES;
    }
  }

  private loadStoredSubmissions(): TransferSubmission[] {
    if (typeof window === 'undefined') return SEED_SUBMISSIONS;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.submissions);
      return raw ? JSON.parse(raw) : SEED_SUBMISSIONS;
    } catch {
      return SEED_SUBMISSIONS;
    }
  }

  private saveProviders(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.providers, JSON.stringify(this._providers()));
    } catch {
      // quota
    }
  }

  private saveSession(provider: ProviderUser | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (provider) {
        localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(provider));
      } else {
        localStorage.removeItem(STORAGE_KEYS.session);
      }
    } catch {
      // quota
    }
  }

  private saveExperiences(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.experiences, JSON.stringify(this._experiences()));
    } catch {
      // quota
    }
  }

  private saveSubmissions(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(this._submissions()));
    } catch {
      // quota
    }
  }
}

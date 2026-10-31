import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { NewsletterService } from '../../core/services/newsletter.service';
import { ExperienceService } from '../../core/services/experience.service';
import { Experience } from '../../core/models/experience.model';

import { ActivityHistoryService } from '../../core/services/activity-history.service';
import { PaymentReceipt } from '../../core/models/activity-history.model';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { HeaderComponent } from '../../shared/components/header/header.component';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../shared/components/breadcrumb/breadcrumb.component';

export type ModalType =
  | 'roadmap'
  | 'experiences'
  | 'providers'
  | 'tiers'
  | 'history'
  | 'founder_application'
  | 'login'
  | null;

export interface LandscapeLocation {
  image: string;
  name: string;
  region: string;
  altitude: string;
  coordsText: string;
  description: string;
  officialUrl?: string;
}

@Component({
  selector: 'app-waitlist',
  standalone: true,
  imports: [MatIconModule, RouterLink, FooterComponent, HeaderComponent, BreadcrumbComponent],
  templateUrl: './waitlist.component.html',
  styleUrl: './waitlist.component.css',
})
export class WaitlistComponent {
  readonly breadcrumbs: BreadcrumbItem[] = [{ label: 'Inicio' }];
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);
  readonly newsletter = inject(NewsletterService);
  readonly experienceService = inject(ExperienceService);
  readonly activityService = inject(ActivityHistoryService);

  constructor() {
    this.route.queryParams.subscribe((params) => {
      const modal = params['modal'] as ModalType;
      if (
        modal &&
        [
          'roadmap',
          'experiences',
          'providers',
          'tiers',
          'history',
          'founder_application',
          'login',
        ].includes(modal)
      ) {
        this.openModal(modal);
      }
    });
  }

  // Email de suscripción socio emergente
  readonly email = signal('');
  readonly copyStatus = signal<string | null>(null);

  // Iniciar Sesión
  readonly loginEmail = signal('');
  readonly loginError = signal<string | null>(null);

  // Menú desplegable de perfil de usuario
  readonly profileMenuOpen = signal(false);

  // Menú hamburguesa móvil
  readonly mobileMenuOpen = signal(false);

  // Modales interactivos
  readonly activeModal = signal<ModalType>(null);
  readonly selectedExperience = signal<Experience | null>(null);

  // Pre-registro de Prestadores de Servicio
  readonly providerName = signal('');
  readonly providerEmail = signal('');
  readonly providerPhone = signal('');
  readonly providerWebsite = signal('');
  readonly providerCategory = signal('guia_montaña');
  readonly providerRegion = signal('Puna & Fiambalá');
  readonly providerSuccess = signal(false);

  // Postulación de Socio Fundador (Carta de Admisión)
  readonly founderName = signal('');
  readonly founderEmail = signal('');
  readonly founderPhone = signal('');
  readonly founderCity = signal('');
  readonly founderLetter = signal('');
  readonly founderAgreedToPrice = signal(false);
  readonly founderSuccess = signal(false);

  // Formulario Perfil de Socio Emergente
  readonly memberFullName = signal(this.newsletter.currentMember()?.fullName || '');
  readonly selectedExperiences = signal<string[]>(
    this.newsletter.currentMember()?.experiencesWishlist || [],
  );
  readonly profileSaved = signal(Boolean(this.newsletter.currentMember()?.fullName));

  readonly wishlistExperiences = [
    { id: 'galan', icon: '🌋', title: 'Volcán Galán & Caldera Gigante' },
    { id: 'seismiles', icon: '🚙', title: 'Travesía 4x4 Paso San Francisco & Seismiles' },
    { id: 'kayak', icon: '🚣', title: 'Kayak & Aguas Calmas en Diques Andinos' },
    { id: 'pissis', icon: '🏔️', title: 'Trekking Balcón del Pissis & Lagunas' },
    { id: 'astroturismo', icon: '🌌', title: 'Astrofotografía & Cielos de la Puna' },
    { id: 'termas', icon: '🌿', title: 'Termas de Fiambalá & Valles Secretos' },
  ];

  // Fondos fotográficos con geolocalización exacta de Catamarca
  readonly landscapes: LandscapeLocation[] = [
    {
      image: '/assets/images/laguna_blanca.jpg',
      name: 'Laguna Blanca',
      region: 'Belén · Reserva de Biósfera UNESCO, Catamarca',
      altitude: '3.200 msnm',
      coordsText: '26°32′S 66°56′O',
      description:
        'Pueblo andino de la Puna catamarqueña y santuario de vicuñas, distinguido en Best Tourism Villages por ONU Turismo.',
      officialUrl:
        'https://www.argentina.gob.ar/jefatura/turismo/best-tourism-villages-argentina/laguna-blanca-catamarca',
    },
    {
      image: '/assets/images/catamarca_pomez.jpg',
      name: 'Campo de Piedra Pómez',
      region: 'Antofagasta de la Sierra · Puna Catamarqueña',
      altitude: '3.300 msnm',
      coordsText: '26°42′S 67°30′O',
      description: 'Laberinto surrealista de roca volcánica blanca esculpida por el viento andino.',
    },
    {
      image: '/assets/images/catamarca_hero.jpg',
      name: 'Balcón del Pissis & Seismiles Sagrados',
      region: 'Fiambalá · Paso de San Francisco, Catamarca',
      altitude: '4.600 msnm',
      coordsText: '27°45′S 68°47′O',
      description:
        'Mirador panorámico de alta montaña hacia lagunas turquesas y volcanes de más de 6.000 metros.',
    },
  ];

  readonly bgIndex = signal(0);
  readonly currentLandscape = computed(() => this.landscapes[this.bgIndex()]);
  readonly bg = computed(() => this.currentLandscape().image);

  cycleBg(): void {
    this.bgIndex.set((this.bgIndex() + 1) % this.landscapes.length);
  }

  toggleProfileMenu(event: Event): void {
    event.stopPropagation();
    this.mobileMenuOpen.set(false);
    this.profileMenuOpen.update((v) => !v);
  }

  toggleMobileMenu(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.profileMenuOpen.set(false);
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  logout(): void {
    this.newsletter.resetCurrentSubscription();
    this.profileMenuOpen.set(false);
    this.mobileMenuOpen.set(false);
  }

  private modalOpenTimestamp = 0;

  openModalFromProfile(modal: ModalType, event?: Event): void {
    console.log('[PROFILE] openModalFromProfile clicked:', modal);
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.openModal(modal);
  }

  cycleBgFromProfile(): void {
    this.cycleBg();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event?: MouseEvent): void {
    console.log('[DOCUMENT] click detected on:', event?.target);
    if (this.profileMenuOpen()) {
      this.profileMenuOpen.set(false);
    }
    if (this.mobileMenuOpen()) {
      this.mobileMenuOpen.set(false);
    }
  }

  openModal(modal: ModalType, exp?: Experience): void {
    console.log('[MODAL] openModal called with:', modal);
    this.profileMenuOpen.set(false);
    this.mobileMenuOpen.set(false);
    this.modalOpenTimestamp = Date.now();
    this.activeModal.set(modal);
    if (exp) {
      this.selectedExperience.set(exp);
    }
  }

  toggleExperienceDetails(exp: Experience): void {
    if (this.selectedExperience()?.id === exp.id) {
      this.selectedExperience.set(null);
    } else {
      this.selectedExperience.set(exp);
    }
  }

  closeModal(): void {
    if (Date.now() - this.modalOpenTimestamp < 400) {
      return;
    }
    this.activeModal.set(null);
    this.selectedExperience.set(null);
    this.activityService.closeReceipt();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.activeModal()) {
      this.activeModal.set(null);
      this.selectedExperience.set(null);
      this.activityService.closeReceipt();
    }
    this.profileMenuOpen.set(false);
    this.mobileMenuOpen.set(false);
  }

  onBackdropClick(event: MouseEvent): void {
    if (Date.now() - this.modalOpenTimestamp < 400) {
      return;
    }
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  openReceipt(receipt: PaymentReceipt, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.activityService.viewReceipt(receipt);
  }

  closeReceipt(): void {
    this.activityService.closeReceipt();
  }

  printReceipt(): void {
    window.print();
  }

  goToHomeSubscribe(): void {
    this.closeModal();
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.pill-input');
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  }


  openFounderApplication(): void {
    const member = this.newsletter.currentMember();
    if (member) {
      if (!this.founderName().trim() && member.fullName) {
        this.founderName.set(member.fullName);
      }
      if (!this.founderEmail().trim() && member.email) {
        this.founderEmail.set(member.email);
      }
      if (!this.founderCity().trim()) {
        this.founderCity.set('Catamarca');
      }
    }
    this.openModal('founder_application');
  }

  submitFounderApplication(): void {
    if (
      !this.founderName().trim() ||
      !this.founderEmail().trim() ||
      !this.founderLetter().trim() ||
      !this.founderAgreedToPrice() ||
      this.founderName().trim().length > 100 ||
      this.founderEmail().trim().length > 254 ||
      this.founderPhone().trim().length > 25 ||
      this.founderCity().trim().length > 100 ||
      this.founderLetter().trim().length > 3000
    ) {
      return;
    }
    this.founderSuccess.set(true);
  }

  toggleExperienceWishlist(id: string): void {
    this.selectedExperiences.update((list) =>
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
    );
  }

  isExperienceSelected(id: string): boolean {
    return this.selectedExperiences().includes(id);
  }

  getExperienceTitle(id: string): string {
    const found = this.wishlistExperiences.find((e) => e.id === id);
    return found ? `${found.icon} ${found.title}` : id;
  }

  async saveMemberProfile(): Promise<void> {
    if (
      !this.memberFullName().trim() ||
      this.selectedExperiences().length === 0
    ) {
      return;
    }
    const res = await this.newsletter.updateMemberProfile({
      fullName: this.memberFullName().trim(),
      experiencesWishlist: this.selectedExperiences(),
    });
    if (res.success) {
      this.profileSaved.set(true);
    }
  }

  editMemberProfile(): void {
    this.profileSaved.set(false);
  }

  openLoginModal(): void {
    this.mobileMenuOpen.set(false);
    this.loginError.set(null);
    this.loginEmail.set('');
    this.openModal('login');
  }

  async submitLogin(): Promise<void> {
    const email = this.loginEmail().trim().toLowerCase();
    if (!email || this.newsletter.isLoading()) return;

    const res = await this.newsletter.loginWithEmail(email);
    if (res.alreadyRegisteredSocio) {
      this.loginError.set(res.message);
    } else if (res.alreadyInWaitlist || res.notFound) {
      this.closeModal();
      this.router.navigate(['/socios/emergentes'], {
        queryParams: { email, from: 'waitlist' },
      });
    } else if (res.success) {
      this.closeModal();
      this.router.navigate(['/perfil']);
    } else {
      this.loginError.set(res.message);
    }
  }

  async submit(): Promise<void> {
    const cleanEmail = this.email().trim().toLowerCase();
    if (!cleanEmail || this.newsletter.isLoading()) return;

    if (this.newsletter.isSubscribed()) {
      this.newsletter.resetCurrentSubscription();
    }

    await this.newsletter.loginWithEmail(cleanEmail);

    this.email.set('');
    this.router.navigate(['/socios/emergentes'], {
      queryParams: { email: cleanEmail, from: 'waitlist' },
    });
  }

  copyLink(): void {
    const url = location.origin;
    navigator.clipboard.writeText(url).then(() => {
      this.copyStatus.set('¡Enlace de EXPERIENCIAS.CLUB copiado!');
      setTimeout(() => this.copyStatus.set(null), 2500);
    });
  }

  shareWhatsApp(): void {
    const url = location.href;
    const text = encodeURIComponent(
      `Conocé el Club de Experiencias: expediciones andinas y travesías náuticas en Catamarca. Sumate y descubrí tu próxima experiencia: ${url}`,
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  }

  shareX(): void {
    const text = encodeURIComponent(
      'Club de Experiencias: expediciones andinas y travesías náuticas en Catamarca.',
    );
    const url = encodeURIComponent(location.href);
    window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  }

  submitProvider(): void {
    if (
      !this.providerEmail().trim() ||
      !this.providerName().trim() ||
      this.providerName().trim().length > 120 ||
      this.providerEmail().trim().length > 254 ||
      this.providerPhone().trim().length > 25 ||
      this.providerWebsite().trim().length > 2048
    )
      return;
    this.providerSuccess.set(true);
    setTimeout(() => {
      this.providerName.set('');
      this.providerEmail.set('');
      this.providerPhone.set('');
      this.providerSuccess.set(false);
      this.closeModal();
    }, 2800);
  }
}

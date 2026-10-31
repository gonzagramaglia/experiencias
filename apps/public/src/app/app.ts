import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { filter } from 'rxjs';

const DEFAULT_PAGE_METADATA = {
  section: 'Expediciones privadas en Catamarca',
  description:
    'Expediciones andinas y travesías náuticas en Catamarca. Descubrí experiencias privadas y sumate.',
  image: '/assets/images/catamarca_hero.jpg',
  imageAlt: 'Experiencias y expediciones en Catamarca',
};

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('Club de Experiencias · Catamarca');
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly pageTitle = inject(Title);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        }
        this.updatePageMetadata(event.urlAfterRedirects);
      });

    this.updatePageMetadata(this.router.url);

    if (typeof document !== 'undefined') {
      const updateSpanishValidity = (event: Event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          return;
        }
        target.setCustomValidity('');
        const val = target.value.trim();

        if (target.validity.valueMissing) {
          target.setCustomValidity('Por favor, completá este campo.');
          return;
        }

        if (target instanceof HTMLInputElement && target.type === 'email' && val) {
          if (!val.includes('@')) {
            target.setCustomValidity(
              `Por favor, incluí un '@' en la dirección de correo electrónico. A '${val}' le falta un '@'.`,
            );
            return;
          }
          const [localPart, domainPart] = val.split('@');
          if (!localPart) {
            target.setCustomValidity(
              `Por favor, ingresá texto antes de '@'. '${val}' está incompleto.`,
            );
            return;
          }
          if (!domainPart) {
            target.setCustomValidity(
              `Por favor, ingresá la parte que sigue a '@'. '${val}' está incompleto.`,
            );
            return;
          }
          if (target.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
            target.setCustomValidity(
              'Por favor, ingresá una dirección de correo electrónico válida.',
            );
          }

        }
      };

      document.addEventListener('input', updateSpanishValidity, true);
      document.addEventListener('invalid', updateSpanishValidity, true);
    }
  }

  private updatePageMetadata(url: string): void {
    const isBrowser = typeof window !== 'undefined';
    const host = isBrowser ? window.location.hostname.toLowerCase() : '';
    const search = isBrowser ? window.location.search.toLowerCase() : '';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

    const isAdminHost =
      host.startsWith('admin.') ||
      host.includes('admin.experiencias') ||
      (isLocalHost && (search.includes('portal=admin') || search.includes('admin=true')));

    const isProviderHost =
      host.startsWith('prestadores.') ||
      host.includes('prestadores.experiencias') ||
      (isLocalHost && (search.includes('portal=prestador') || search.includes('prestador=true')));

    const metadata = this.getPageMetadata(url);
    let title = `Club de Experiencias | ${metadata.section}`;
    let themeColor = '#ffffff';

    if (isAdminHost) {
      title = 'Portal de Administración · EXPERIENCIAS.CLUB';
      themeColor = '#ff5f00';
    } else if (isProviderHost) {
      title = 'Portal de Prestadores · EXPERIENCIAS.CLUB';
      themeColor = '#00388f';
    }

    if (isBrowser) {
      const iconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
      let iconBase = '';
      if (isAdminHost) {
        iconBase = '/assets/favicons/admin';
      } else if (isProviderHost) {
        iconBase = '/assets/favicons/prestadores';
      }

      iconLinks.forEach((link) => {
        const sizes = link.getAttribute('sizes');
        const rel = link.getAttribute('rel');
        if (rel === 'apple-touch-icon') {
          link.href = iconBase ? `${iconBase}/apple-touch-icon.png` : '/apple-touch-icon.png';
        } else if (sizes === '32x32') {
          link.href = iconBase ? `${iconBase}/favicon-32x32.png` : '/favicon-32x32.png';
        } else if (sizes === '16x16') {
          link.href = iconBase ? `${iconBase}/favicon-16x16.png` : '/favicon-16x16.png';
        } else {
          link.href = iconBase ? `${iconBase}/favicon.ico` : '/favicon.ico';
        }
      });
    }

    const absoluteUrl =
      typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url;
    const absoluteImage =
      typeof window !== 'undefined'
        ? new URL(metadata.image, window.location.origin).href
        : metadata.image;

    this.pageTitle.setTitle(title);
    this.meta.updateTag({ name: 'theme-color', content: themeColor });
    this.meta.updateTag({ name: 'description', content: metadata.description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: metadata.description });
    this.meta.updateTag({ property: 'og:image', content: absoluteImage });
    this.meta.updateTag({ property: 'og:image:alt', content: metadata.imageAlt });
    this.meta.updateTag({ property: 'og:url', content: absoluteUrl });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: metadata.description });
    this.meta.updateTag({ name: 'twitter:image', content: absoluteImage });
    this.meta.updateTag({ name: 'twitter:image:alt', content: metadata.imageAlt });
  }

  private getPageMetadata(url: string): typeof DEFAULT_PAGE_METADATA {
    const isBrowser = typeof window !== 'undefined';
    const host = isBrowser ? window.location.hostname.toLowerCase() : '';
    const search = isBrowser ? window.location.search.toLowerCase() : '';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

    const isAdminHost =
      host.startsWith('admin.') ||
      host.includes('admin.experiencias') ||
      (isLocalHost && (search.includes('portal=admin') || search.includes('admin=true')));
    const path = url.split('?')[0].split('#')[0];

    if (isAdminHost) {
      return {
        section: 'Administración Central',
        description:
          'Supervisión de socios, lista de espera y conciliación de transferencias en admin.experiencias.club.',
        image: '/assets/images/logo-admin-experiencias-club.png',
        imageAlt: 'Administración EXPERIENCIAS.CLUB',
      };
    }
    if (path.startsWith('/prestadores')) {
      return {
        section: 'Comunidad de Prestadores & Guías Locales',
        description: 'Sumate como guía o prestador de expediciones en Catamarca.',
        image: '/assets/images/laguna_blanca.jpg',
        imageAlt: 'Prestadores de Experiencias Catamarca',
      };
    }
    if (path.startsWith('/socios/emergentes') || path === '/emergentes') {
      return {
        section: 'Socio Emergente',
        description: 'Activá tu membresía emergente en el Club de Experiencias.',
        image: '/assets/images/catamarca_hero.jpg',
        imageAlt: 'Socio Emergente',
      };
    }
    if (path.startsWith('/comprobantes')) {
      return {
        section: 'Conciliación de Comprobantes de Pago',
        description:
          'Validación y control de transferencias bancarias de expediciones.',
        image: '/assets/images/logo-admin-experiencias-club.png',
        imageAlt: 'Comprobantes de Pago EXPERIENCIAS.CLUB',
      };
    }
    if (path.startsWith('/prestador')) {
      return {
        section: 'Portal de prestadores',
        description:
          'Gestioná tus experiencias, fechas, comprobantes e inscriptos desde el portal de prestadores.',
        image: '/assets/images/logo-club-experiencias.png',
        imageAlt: 'Portal de prestadores del Club de Experiencias',
      };
    }
    if (path.startsWith('/socios')) {
      return {
        section: 'Socios del Club',
        description:
          'Conocé los niveles de socio y accedé a experiencias privadas en Catamarca.',
        image: '/assets/images/catamarca_hero.jpg',
        imageAlt: 'Socios del Club de Experiencias',
      };
    }
    return DEFAULT_PAGE_METADATA;
  }
}

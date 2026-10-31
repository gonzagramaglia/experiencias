import { Component, HostListener, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NewsletterService } from '../../core/services/newsletter.service';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { HeaderComponent } from '../../shared/components/header/header.component';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../shared/components/breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    FooterComponent,
    HeaderComponent,
    BreadcrumbComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  readonly newsletter = inject(NewsletterService);
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);

  readonly breadcrumbs: BreadcrumbItem[] = [
    { label: 'Inicio', url: '/' },
    { label: 'Iniciar Sesión' },
  ];

  readonly mobileMenuOpen = signal(false);
  readonly email = signal('');
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly notFoundEmail = signal<string | null>(null);
  readonly alreadyRegisteredEmail = signal<string | null>(null);

  ngOnInit(): void {
    if (this.newsletter.isSubscribed()) {
      this.router.navigate(['/perfil']);
      return;
    }

    this.route.queryParams.subscribe((params) => {
      const paramEmail = ((params['email'] as string) || '').trim().toLowerCase();
      if (paramEmail) {
        this.email.set(paramEmail);
      }
      if (params['registered'] === 'true') {
        this.router.navigate(['/socios/emergentes'], {
          queryParams: { email: paramEmail, from: 'waitlist' },
        });
        return;
      }
    });
  }

  async signInGoogle(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    const res = await this.newsletter.signInWithGoogle();
    this.isLoading.set(false);
    if (!res.success) {
      this.error.set(res.message);
    }
  }

  toggleMobileMenu(event: Event): void {
    event.stopPropagation();
    this.mobileMenuOpen.update((v) => !v);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.mobileMenuOpen.set(false);
  }

  onEmailInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.email.set(input.value);
    this.error.set(null);
    this.applySpanishValidity(input);
  }

  onEmailInvalid(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.applySpanishValidity(input);
  }

  private applySpanishValidity(input: HTMLInputElement): void {
    input.setCustomValidity('');
    const val = input.value.trim();

    if (input.validity.valueMissing || !val) {
      input.setCustomValidity('Por favor, completá este campo.');
      return;
    }

    if (!val.includes('@')) {
      input.setCustomValidity(
        `Por favor, incluí un '@' en la dirección de correo electrónico. A '${val}' le falta un '@'.`,
      );
      return;
    }

    const [localPart, domainPart] = val.split('@');
    if (!localPart) {
      input.setCustomValidity(
        `Por favor, ingresá texto antes de '@'. '${val}' está incompleto.`,
      );
      return;
    }

    if (!domainPart) {
      input.setCustomValidity(
        `Por favor, ingresá la parte que sigue a '@'. '${val}' está incompleto.`,
      );
      return;
    }

    if (input.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
      input.setCustomValidity(
        `Por favor, ingresá una dirección de correo electrónico válida (ej. socio@ejemplo.com).`,
      );
    }
  }

  async submitLogin(): Promise<void> {
    const emailVal = this.email().trim().toLowerCase();
    if (!emailVal) {
      this.error.set('Por favor, ingresá tu correo electrónico.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(emailVal)) {
      this.error.set('Por favor, ingresá un correo electrónico válido (ej. socio@ejemplo.com).');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.successMessage.set(null);
    this.notFoundEmail.set(null);
    this.alreadyRegisteredEmail.set(null);

    try {
      const res = await this.newsletter.loginWithEmail(emailVal);
      this.isLoading.set(false);

      if (res.alreadyRegisteredSocio || res.alreadyInWaitlist) {
        this.successMessage.set(res.message || '¡Correo verificado con éxito! Redirigiendo a tu ficha...');
        this.router.navigate(['/socios/emergentes'], {
          queryParams: { email: emailVal, from: 'waitlist' },
        });
      } else if (res.notFound) {
        this.notFoundEmail.set(emailVal);
        this.error.set(null);
      } else if (res.success && res.entry) {
        this.successMessage.set(res.message);
        this.router.navigate(['/perfil']);
      } else {
        this.error.set(res.message || 'Ocurrió un error al verificar tu membresía.');
      }
    } catch {
      this.isLoading.set(false);
      this.error.set('Error de conexión con el servicio. Intentá nuevamente.');
    }
  }

  registerNowWithEmail(): void {
    const emailVal = (this.notFoundEmail() || this.email()).trim().toLowerCase();
    if (!emailVal) return;

    this.router.navigate(['/socios/emergentes'], {
      queryParams: { email: emailVal, from: 'waitlist' },
    });
  }
}

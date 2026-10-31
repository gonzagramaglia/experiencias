import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WaitlistComponent } from './waitlist.component';

describe('WaitlistComponent All Desktop Modals & Navigation', () => {
  let component: WaitlistComponent;
  let fixture: ComponentFixture<WaitlistComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [WaitlistComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(WaitlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should link to /socios when clicking Niveles de Socio', () => {
    const sociosBtn = fixture.nativeElement.querySelector('.socios-nav-btn');
    expect(sociosBtn).toBeTruthy();
    expect(sociosBtn.getAttribute('routerlink') || sociosBtn.getAttribute('href')).toBe('/socios');
  });

  it('should link to /experiencias when clicking Experiencias', () => {
    const expBtn = fixture.nativeElement.querySelector('.exp-nav-btn');
    expect(expBtn).toBeTruthy();
    expect(expBtn.getAttribute('routerlink') || expBtn.getAttribute('href')).toBe('/experiencias');
  });

  it('should have a Convertirme en Prestador link in the footer pointing to /prestadores', () => {
    const providerLinks = fixture.nativeElement.querySelectorAll('.footer-provider-link');
    expect(providerLinks.length).toBeGreaterThanOrEqual(2);
    const becomeProviderLink = Array.from(providerLinks).find((el: any) =>
      el.textContent.includes('Convertirme en Prestador'),
    ) as HTMLElement;
    expect(becomeProviderLink).toBeTruthy();
    expect(
      becomeProviderLink.getAttribute('routerlink') || becomeProviderLink.getAttribute('href'),
    ).toBe('/prestadores');
  });

  it('should show Iniciar Sesión button when not subscribed and link to /ingresar', () => {
    const loginBtn = fixture.nativeElement.querySelector('.login-nav-btn');
    expect(loginBtn).toBeTruthy();
    expect(loginBtn.textContent).toContain('Iniciar Sesión');
    expect(loginBtn.getAttribute('routerlink') || loginBtn.getAttribute('href')).toBe('/ingresar');
  });

  it('should show Cerrar Sesión button when subscribed and open confirmation modal on click', async () => {
    await component.newsletter.joinWaitlist({
      email: 'socio@experiencias.club',
      fullName: 'Socio Test',
      dni: '30123456',
      phone: '3834123456',
    });
    fixture.detectChanges();

    const profileBtn = fixture.nativeElement.querySelector('.profile-btn') as HTMLElement;
    expect(profileBtn).toBeTruthy();
    expect(profileBtn.textContent).toContain('Cerrar Sesión');

    profileBtn.click();
    fixture.detectChanges();

    const confirmBtn = fixture.nativeElement.querySelector('.logout-confirm-btn') as HTMLElement;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();
    fixture.detectChanges();

    expect(component.newsletter.isSubscribed()).toBe(false);
  });

  it('should allow user to logout from mobile menu with confirmation modal', async () => {
    await component.newsletter.joinWaitlist({
      email: 'socio@test.com',
      fullName: 'Socio Test',
      dni: '30123456',
      phone: '3834123456',
    });
    fixture.detectChanges();

    component.mobileMenuOpen.set(true);
    fixture.detectChanges();

    const logoutBtn = fixture.nativeElement.querySelector('.logout-row') as HTMLElement;
    expect(logoutBtn).toBeTruthy();
    expect(logoutBtn.textContent).toContain('Cerrar Sesión');

    logoutBtn.click();
    fixture.detectChanges();

    const confirmBtn = fixture.nativeElement.querySelector('.logout-confirm-btn') as HTMLElement;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();
    fixture.detectChanges();

    expect(component.newsletter.isSubscribed()).toBe(false);
    expect(fixture.nativeElement.querySelector('.login-nav-btn')).toBeTruthy();
  });
});

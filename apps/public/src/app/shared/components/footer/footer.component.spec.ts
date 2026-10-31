import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FooterComponent } from './footer.component';
import { NewsletterService } from '../../../core/services/newsletter.service';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  let newsletter: NewsletterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [provideRouter([{ path: 'ingresar', component: FooterComponent }])],
    }).compileComponents();

    newsletter = TestBed.inject(NewsletterService);
    newsletter.resetCurrentSubscription();
    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render location text and provider link', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.location-place')?.textContent).toContain('Laguna Blanca');
    const providerLink = compiled.querySelector('.footer-provider-link');
    expect(providerLink).toBeTruthy();
    expect(providerLink?.getAttribute('routerLink')).toBe('/prestadores');
  });

  it('should render the black session strip with guest info when not logged in', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const sessionBar = compiled.querySelector('.footer-session-bar');
    expect(sessionBar).toBeTruthy();
    expect(sessionBar?.textContent).not.toContain('Invitado');
    expect(sessionBar?.textContent).toContain('Sin membresía activa');
    const loginBtn = compiled.querySelector('.login-action');
    expect(loginBtn).toBeTruthy();
    expect(loginBtn?.getAttribute('routerLink')).toBe('/ingresar');
  });

  it('should render user email, membership tier and logout button when subscribed', async () => {
    await newsletter.joinWaitlist({ email: 'explorador@experiencias.club' });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const sessionBar = compiled.querySelector('.footer-session-bar');
    expect(sessionBar?.textContent).toContain('explorador@experiencias.club');
    expect(sessionBar?.textContent).toContain('Socio Emergente');
    const logoutBtn = compiled.querySelector('.logout-action') as HTMLButtonElement;
    expect(logoutBtn).toBeTruthy();
    expect(logoutBtn.textContent).toContain('Cerrar Sesión');

    const logoutSpy = vi.spyOn(component, 'logout');
    logoutBtn.click();
    expect(logoutSpy).toHaveBeenCalled();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { supportConfig } from '@shared/product';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('json2fit.language', 'pl');
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
  });

  it('renders compact global navigation and footer links', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const header = fixture.nativeElement.querySelector('[data-testid="app-header"]') as HTMLElement;
    const headerLayout = header.querySelector('div') as HTMLElement;
    const logo = fixture.nativeElement.querySelector('[data-testid="app-logo"]') as HTMLAnchorElement;
    const nav = fixture.nativeElement.querySelector('nav[aria-label="Główna nawigacja"]') as HTMLElement;
    const privacyBadge = fixture.nativeElement.querySelector('[data-testid="privacy-badge"]') as HTMLElement | null;
    const footer = fixture.nativeElement.querySelector('[data-testid="app-footer"]') as HTMLElement;
    const startLink = nav.querySelector('a[href="/"]') as HTMLAnchorElement;
    const converterLink = nav.querySelector('a[href="/convert"]') as HTMLAnchorElement;
    const detailsLink = nav.querySelector('a[href="/details"]') as HTMLAnchorElement;
    const helpLink = nav.querySelector('a[href="/help"]') as HTMLAnchorElement;

    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
    expect(headerLayout.className).toContain('h-14');
    expect(headerLayout.className).toContain('sm:h-16');
    expect(headerLayout.className).not.toContain('flex-col');
    expect(logo.textContent).toContain('json2fit');
    expect(logo.getAttribute('href')).toBe('/');
    expect(nav.className).toContain('md:flex');
    expect(privacyBadge).toBeNull();
    expect(text).not.toContain('Narzędzie do migracji danych');
    expect(text).not.toContain('Pliki są przetwarzane lokalnie w przeglądarce.');
    expect(footer.textContent).toContain('Kontakt');
    expect(footer.textContent).toContain('json2fit@0x00.com.pl');
    expect(footer.querySelector('a[href="mailto:json2fit@0x00.com.pl"]')?.textContent).toContain('json2fit@0x00.com.pl');
    expect(footer.textContent).not.toContain('Mapa strony');
    expect(footer.querySelector('a[href="/help"]')?.textContent).toContain('Pomoc');
    expect(footer.querySelector('a[href="/help#privacy"]')?.textContent).toContain('Prywatność');
    expect(footer.textContent).toContain('Wesprzyj projekt');
    const supportLink = footer.querySelector(`a[href="${supportConfig.buyMeACoffeeUrl}"]`) as HTMLAnchorElement;
    expect(supportLink).toBeTruthy();
    expect(supportLink.getAttribute('target')).toBe('_blank');
    expect(supportLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(startLink).toBeTruthy();
    expect(converterLink).toBeTruthy();
    expect(detailsLink).toBeTruthy();
    expect(helpLink).toBeTruthy();
  });

  it('toggles between light and dark mode from the compact header', () => {
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector('[data-testid="theme-toggle"]') as HTMLButtonElement;
    expect(toggle.textContent?.trim()).toBe('');
    expect(toggle.getAttribute('aria-label')).toBe('Przełącz na tryb ciemny');
    expect(toggle.className).toContain('h-10');
    expect(toggle.className).toContain('w-10');
    expect(toggle.className).not.toContain('absolute');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    toggle.click();
    fixture.detectChanges();

    expect(toggle.textContent?.trim()).toBe('');
    expect(toggle.getAttribute('aria-label')).toBe('Przełącz na tryb jasny');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('json2fit-theme')).toBe('dark');
  });

  it('opens and closes mobile navigation without moving the theme toggle into the menu', () => {
    fixture.detectChanges();

    const menuToggle = fixture.nativeElement.querySelector('[data-testid="mobile-menu-toggle"]') as HTMLButtonElement;
    const themeToggle = fixture.nativeElement.querySelector('[data-testid="theme-toggle"]') as HTMLButtonElement;

    expect(menuToggle).toBeTruthy();
    expect(menuToggle.className).toContain('h-10');
    expect(menuToggle.getAttribute('aria-expanded')).toBe('false');
    expect(themeToggle.className).toContain('h-10');
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-navigation"]')).toBeNull();

    menuToggle.click();
    fixture.detectChanges();

    const mobileNav = fixture.nativeElement.querySelector('[data-testid="mobile-navigation"]') as HTMLElement;
    expect(menuToggle.getAttribute('aria-expanded')).toBe('true');
    expect(mobileNav).toBeTruthy();
    expect(mobileNav.textContent).toContain('Start');
    expect(mobileNav.textContent).toContain('Konwerter');
    expect(mobileNav.textContent).toContain('Szczegóły');
    expect(mobileNav.textContent).toContain('Pomoc');
    expect(mobileNav.querySelector('[data-testid="theme-toggle"]')).toBeNull();

    menuToggle.click();
    fixture.detectChanges();

    expect(menuToggle.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-navigation"]')).toBeNull();
  });
});

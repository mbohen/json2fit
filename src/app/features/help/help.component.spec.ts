import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HELP_SECTIONS } from '@app/shared/help/help-content';
import { HelpComponent } from './help.component';

describe('HelpComponent', () => {
  let fixture: ComponentFixture<HelpComponent>;

  beforeEach(async () => {
    localStorage.setItem('json2fit.language', 'pl');

    await TestBed.configureTestingModule({
      imports: [HelpComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(HelpComponent);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the help page, table of contents, all sections and FAQ', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const sections = fixture.nativeElement.querySelectorAll('[data-testid="help-section"]');

    expect(text).toContain('Jak przenieść dane z Polar Flow do Garmin Connect?');
    expect(text).toContain('Jak pobrać eksport z konta Polar?');
    expect(text).toContain('Pobierz pełne archiwum danych z konta Polar, a nie z aplikacji Polar Flow');
    expect(text).toContain('Spis treści');
    expect(sections.length).toBe(7);
    for (const section of HELP_SECTIONS) {
      expect(fixture.nativeElement.querySelector(`#${section.id}`)).toBeTruthy();
    }
    expect(fixture.nativeElement.querySelector('[data-testid="help-faq"]')?.textContent).toContain('Czy moje pliki trafiają na serwer?');
  });

  it('keeps help menu links on the help route with section fragments', () => {
    fixture.detectChanges();

    const toc = fixture.nativeElement.querySelector('[data-testid="help-toc"]') as HTMLElement;
    const links = Array.from(toc.querySelectorAll('a')) as HTMLAnchorElement[];

    expect(links.map((link) => link.getAttribute('href'))).toEqual(HELP_SECTIONS.map((section) => `/help#${section.id}`));
  });

  it('renders only the controlled Polar account export URL', () => {
    fixture.detectChanges();

    const externalLinks = Array.from(fixture.nativeElement.querySelectorAll('a[href^="http"]')) as HTMLAnchorElement[];

    expect(externalLinks.map((link) => link.href)).toEqual(['https://account.polar.com/#export']);
    expect(externalLinks[0].textContent).toContain('Otwórz eksport konta Polar');
    expect(externalLinks[0].getAttribute('target')).toBe('_blank');
    expect(externalLinks[0].getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('keeps the mobile layout single-column and avoids wide tables', () => {
    fixture.detectChanges();

    const root = fixture.nativeElement.querySelector('main') as HTMLElement;
    expect(root.textContent).toContain('FAQ');
    expect(root.querySelector('table')).toBeNull();
    expect(root.querySelector('[data-testid="help-toc"]')?.className).toContain('lg:sticky');
  });
});

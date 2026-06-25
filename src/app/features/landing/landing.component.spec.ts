import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BETA_SIGNAL_COUNTERS_STORAGE_KEY } from '@features/beta/beta-signal.model';
import { supportConfig } from '@shared/product';
import { LandingComponent } from './landing.component';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('json2fit.language', 'pl');

    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders the refreshed landing structure with one focused hero message', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const headings = fixture.nativeElement.querySelectorAll('h1');
    const hero = fixture.nativeElement.querySelector('#hero') as HTMLElement;
    const privacy = fixture.nativeElement.querySelector('#privacy') as HTMLElement;
    const howItWorks = fixture.nativeElement.querySelector('#how-it-works') as HTMLElement;
    const support = fixture.nativeElement.querySelector('[data-testid="landing-support"]') as HTMLElement;
    const outputs = fixture.nativeElement.querySelector('#outputs') as HTMLElement;
    const limitations = fixture.nativeElement.querySelector('#limitations') as HTMLElement;

    expect(headings.length).toBe(1);
    expect(hero).toBeTruthy();
    expect(privacy).toBeTruthy();
    expect(howItWorks).toBeTruthy();
    expect(support).toBeTruthy();
    expect(outputs).toBeTruthy();
    expect(limitations).toBeTruthy();
    expect(text).toContain('Polar Flow → Garmin Connect');
    expect(text).toContain('Przenieś treningi z Polar Flow do Garmin Connect');
    expect(text).toContain('Twoje dane nie są wysyłane na serwer');
    expect(text).toContain('Wgraj ZIP lub JSON · pobierz pliki Garmin · dane zostają u Ciebie');
    expect(text).not.toContain('Bez backendu');
    expect(text).toContain('Wesprzyj rozwój json2fit');
    expect(text).toContain('Wsparcie jest opcjonalne');
    expect(text).not.toContain('Co rozwijać dalej?');
    expect(text).not.toContain('FAQ');
  });

  it('links the primary CTA to the converter and the secondary CTA to the page steps', () => {
    fixture.detectChanges();

    const primaryCta = fixture.nativeElement.querySelector('[data-testid="landing-primary-cta"]') as HTMLAnchorElement;
    const secondaryCta = fixture.nativeElement.querySelector('[data-testid="landing-secondary-cta"]') as HTMLAnchorElement;

    expect(primaryCta).toBeTruthy();
    expect(primaryCta.getAttribute('href')).toBe('/convert');
    expect(primaryCta.textContent).toContain('Wgraj eksport Polar Flow');
    expect(secondaryCta).toBeTruthy();
    expect(secondaryCta.getAttribute('href')).toBe('#how-it-works');
    expect(secondaryCta.textContent).toContain('Jak to działa');
  });

  it('shows a subtle Buy Me a Coffee support section', () => {
    fixture.detectChanges();

    const support = fixture.nativeElement.querySelector('[data-testid="landing-support"]') as HTMLElement;
    const supportCta = support.querySelector('[data-testid="support-button"]') as HTMLAnchorElement;

    expect(support.textContent).toContain('Wesprzyj rozwój json2fit');
    expect(support.textContent).toContain('json2fit jest obecnie darmową betą');
    expect(support.textContent).toContain('Postaw kawę');
    expect(supportCta.getAttribute('href')).toBe(supportConfig.buyMeACoffeeUrl);
    expect(supportCta.getAttribute('target')).toBe('_blank');
    expect(supportCta.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('records a local landing view signal without adding beta forms', () => {
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('[data-testid="beta-interest-form"]') as HTMLElement | null;
    const counters = JSON.parse(localStorage.getItem(BETA_SIGNAL_COUNTERS_STORAGE_KEY) ?? '{}');

    expect(form).toBeNull();
    expect(counters).toMatchObject({ landing_view: 1 });
  });

  it('shows privacy, three steps, supported outputs and Garmin limitations', () => {
    fixture.detectChanges();

    const privacy = fixture.nativeElement.querySelector('[data-testid="landing-privacy"]') as HTMLElement;
    const steps = fixture.nativeElement.querySelectorAll('[data-testid="landing-how-it-works"] article');
    const outputs = fixture.nativeElement.querySelector('[data-testid="landing-outputs"]') as HTMLElement;
    const outputCards = outputs.querySelectorAll('article');
    const limitations = fixture.nativeElement.querySelector('[data-testid="landing-limitations"]') as HTMLElement;

    expect(privacy.textContent).toContain('Twoje pliki zostają u Ciebie');
    expect(steps.length).toBe(3);
    expect(outputCards.length).toBe(3);
    expect(outputs.textContent).toContain('TCX');
    expect(outputs.textContent).toContain('FIT');
    expect(outputs.textContent).toContain('CSV');
    expect(outputs.textContent).toContain('raporty');
    expect(limitations.textContent).toContain('Garmin Connect może odrzucić plik');
    expect(limitations.textContent).toContain('FIT jest nadal eksperymentalny');
    expect(limitations.textContent).toContain('spróbuj pobrać TCX');
  });

  it('keeps mobile-first sizing for hero content and CTAs', () => {
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
    const primaryCta = fixture.nativeElement.querySelector('[data-testid="landing-primary-cta"]') as HTMLElement;
    const secondaryCta = fixture.nativeElement.querySelector('[data-testid="landing-secondary-cta"]') as HTMLElement;
    const steps = fixture.nativeElement.querySelector('[data-testid="landing-how-it-works"] > div > div:last-child') as HTMLElement;
    const benefits = fixture.nativeElement.querySelector('[data-testid="landing-benefits-strip"]') as HTMLElement | null;

    expect(heading.className).toContain('text-3xl');
    expect(primaryCta.className).toContain('w-full');
    expect(secondaryCta.className).toContain('w-full');
    expect(steps.className).toContain('md:grid-cols-3');
    expect(benefits).toBeNull();
  });
});

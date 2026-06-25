import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { I18nPipe } from './i18n.pipe';
import { LANGUAGE_STORAGE_KEY } from './i18n.model';
import { LanguageSwitcherComponent } from './language-switcher.component';

@Component({
  standalone: true,
  imports: [I18nPipe, LanguageSwitcherComponent],
  template: `
    <app-language-switcher></app-language-switcher>
    <p data-testid="translated">{{ 'landing.primaryCta' | t }}</p>
  `
})
class LanguageSwitcherHostComponent {}

describe('LanguageSwitcherComponent', () => {
  let fixture: ComponentFixture<LanguageSwitcherHostComponent>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pl');
    mockFetch();

    await TestBed.configureTestingModule({
      imports: [LanguageSwitcherHostComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LanguageSwitcherHostComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('switches translated UI without reloading and stores the selection', async () => {
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="translated"]')?.textContent).toContain('Wgraj eksport Polar Flow');

    const buttons = [...host.querySelectorAll('button')] as HTMLButtonElement[];
    const enButton = buttons.find((button) => button.textContent?.trim() === 'EN')!;

    enButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="translated"]')?.textContent).toContain('Upload Polar Flow export');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(enButton.getAttribute('aria-pressed')).toBe('true');
  });
});

function mockFetch(): void {
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    value: vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({})
    }))
  });
}

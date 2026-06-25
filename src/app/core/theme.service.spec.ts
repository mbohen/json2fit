import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    TestBed.resetTestingModule();
  });

  it('uses light mode by default and applies it to the document', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.mode()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('toggles dark mode and persists the preference', () => {
    const service = TestBed.inject(ThemeService);

    service.toggle();

    expect(service.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('json2fit-theme')).toBe('dark');
  });

  it('restores a stored dark preference', () => {
    localStorage.setItem('json2fit-theme', 'dark');

    const service = TestBed.inject(ThemeService);

    expect(service.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

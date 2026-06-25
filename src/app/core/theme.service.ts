import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'json2fit-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('light');

  private readonly document = inject(DOCUMENT);

  constructor() {
    this.setMode(this.initialMode(), false);
  }

  toggle(): void {
    this.setMode(this.mode() === 'dark' ? 'light' : 'dark');
  }

  setMode(mode: ThemeMode, persist = true): void {
    this.mode.set(mode);
    const root = this.document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    root.style.colorScheme = mode;

    if (persist) {
      this.document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  }

  private initialMode(): ThemeMode {
    const window = this.document.defaultView;
    const stored = window?.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return window?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}

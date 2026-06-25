import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideMenu, LucideMoon, LucideSun, LucideX } from '@lucide/angular';
import { I18nPipe } from './core/i18n/i18n.pipe';
import { LanguageSwitcherComponent } from './core/i18n/language-switcher.component';
import { PwaService } from './core/pwa.service';
import { ThemeService } from './core/theme.service';
import { SupportButtonComponent } from './shared/support/support-button.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideMenu,
    LucideMoon,
    LucideSun,
    LucideX,
    I18nPipe,
    LanguageSwitcherComponent,
    SupportButtonComponent
  ],
  template: `
    <header class="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur transition-colors dark:bg-slate-950/90" data-testid="app-header">
      <div class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16 sm:px-5">
        <a
          routerLink="/"
          class="min-w-0 shrink-0 rounded-md text-base font-bold text-ink transition hover:text-pine focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          data-testid="app-logo"
          (click)="closeMobileMenu()"
        >
          json2fit
        </a>
        <nav class="hidden min-w-0 flex-1 items-center gap-1 text-sm font-medium md:flex" [attr.aria-label]="'nav.mainAria' | t">
            <a
              routerLink="/"
              routerLinkActive="text-pine"
              [routerLinkActiveOptions]="{ exact: true }"
              class="shrink-0 rounded-md px-3 py-2 text-slate-700 transition hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              {{ 'nav.start' | t }}
            </a>
            <a
              routerLink="/convert"
              routerLinkActive="text-pine"
              class="shrink-0 rounded-md px-3 py-2 text-slate-700 transition hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              {{ 'nav.converter' | t }}
            </a>
            <a
              routerLink="/details"
              routerLinkActive="text-pine"
              class="shrink-0 rounded-md px-3 py-2 text-slate-700 transition hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              {{ 'nav.details' | t }}
            </a>
            <a
              routerLink="/help"
              routerLinkActive="text-pine"
              class="shrink-0 rounded-md px-3 py-2 text-slate-700 transition hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              {{ 'nav.help' | t }}
            </a>
          </nav>
          <div class="ml-auto flex shrink-0 items-center gap-2">
          <app-language-switcher class="hidden sm:block"></app-language-switcher>
          <button
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-white text-slate-600 transition hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            type="button"
            [attr.aria-pressed]="theme.mode() === 'dark'"
            [attr.aria-label]="theme.mode() === 'dark' ? ('theme.toggleToLight' | t) : ('theme.toggleToDark' | t)"
            [attr.title]="theme.mode() === 'dark' ? ('theme.light' | t) : ('theme.dark' | t)"
            (click)="theme.toggle()"
            data-testid="theme-toggle"
          >
            <svg *ngIf="theme.mode() === 'dark'; else lightModeIcon" lucideSun [size]="16"></svg>
            <ng-template #lightModeIcon><svg lucideMoon [size]="16"></svg></ng-template>
          </button>
          <button
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-white text-slate-600 transition hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine md:hidden"
            type="button"
            aria-controls="mobile-navigation"
            [attr.aria-expanded]="mobileMenuOpen()"
            [attr.aria-label]="mobileMenuOpen() ? ('menu.close' | t) : ('menu.open' | t)"
            (click)="toggleMobileMenu()"
            data-testid="mobile-menu-toggle"
          >
            <svg *ngIf="mobileMenuOpen(); else menuIcon" lucideX [size]="18"></svg>
            <ng-template #menuIcon><svg lucideMenu [size]="18"></svg></ng-template>
          </button>
        </div>
      </div>
      <nav
        *ngIf="mobileMenuOpen()"
        id="mobile-navigation"
        class="border-t border-line bg-white px-4 py-3 text-sm font-semibold shadow-sm md:hidden"
        [attr.aria-label]="'nav.mobileAria' | t"
        data-testid="mobile-navigation"
      >
        <div class="mx-auto grid max-w-7xl gap-2">
          <app-language-switcher class="sm:hidden"></app-language-switcher>
          <a routerLink="/" routerLinkActive="text-pine" [routerLinkActiveOptions]="{ exact: true }" class="rounded-md px-3 py-3 text-slate-700 hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" (click)="closeMobileMenu()">{{ 'nav.start' | t }}</a>
          <a routerLink="/convert" routerLinkActive="text-pine" class="rounded-md px-3 py-3 text-slate-700 hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" (click)="closeMobileMenu()">{{ 'nav.converter' | t }}</a>
          <a routerLink="/details" routerLinkActive="text-pine" class="rounded-md px-3 py-3 text-slate-700 hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" (click)="closeMobileMenu()">{{ 'nav.details' | t }}</a>
          <a routerLink="/help" routerLinkActive="text-pine" class="rounded-md px-3 py-3 text-slate-700 hover:bg-slate-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" (click)="closeMobileMenu()">{{ 'nav.help' | t }}</a>
        </div>
      </nav>
    </header>
    <router-outlet />
    <footer class="border-t border-line bg-white transition-colors" data-testid="app-footer">
      <div class="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 text-sm text-slate-600 sm:px-5 md:flex-row md:items-start md:justify-between">
        <div class="min-w-0">
          <p class="font-semibold text-ink">{{ 'nav.contact' | t }}</p>
          <p class="mt-3 break-words">
            <a href="mailto:json2fit@0x00.com.pl" class="font-semibold text-pine hover:text-emerald-800">json2fit@0x00.com.pl</a>
          </p>
        </div>
        <nav class="flex min-w-0 flex-wrap gap-3 font-semibold md:justify-end" [attr.aria-label]="'nav.helperAria' | t">
            <a routerLink="/help" class="text-pine hover:text-emerald-800">{{ 'nav.help' | t }}</a>
            <a routerLink="/help" fragment="privacy" class="text-pine hover:text-emerald-800">{{ 'nav.privacy' | t }}</a>
            <app-support-button
              [label]="'footer.supportProject' | t"
              appearance="link"
              [ariaLabel]="'footer.supportProjectAria' | t"
            ></app-support-button>
          </nav>
      </div>
    </footer>
  `
})
export class AppComponent {
  private readonly pwa = inject(PwaService);
  readonly theme = inject(ThemeService);
  readonly mobileMenuOpen = signal(false);

  constructor() {
    void this.pwa.registerServiceWorker();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }
}

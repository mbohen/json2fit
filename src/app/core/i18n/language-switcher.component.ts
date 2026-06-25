import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { I18nPipe } from './i18n.pipe';
import { I18nService } from './i18n.service';
import { LANGUAGE_OPTIONS, SupportedLanguage } from './i18n.model';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  template: `
    <div
      class="inline-flex shrink-0 items-center rounded-md border border-line bg-white p-0.5 text-xs font-semibold text-slate-600"
      role="group"
      [attr.aria-label]="'language.switcherLabel' | t"
      data-testid="language-switcher"
    >
      <button
        *ngFor="let language of languages"
        class="rounded px-2.5 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
        type="button"
        [class.bg-pine]="i18n.currentLanguage() === language.code"
        [class.text-white]="i18n.currentLanguage() === language.code"
        [class.hover:bg-slate-50]="i18n.currentLanguage() !== language.code"
        [class.hover:text-ink]="i18n.currentLanguage() !== language.code"
        [attr.aria-pressed]="i18n.currentLanguage() === language.code"
        [attr.aria-label]="'language.switchTo' | t: { language: language.nativeLabel }"
        (click)="setLanguage(language.code)"
      >
        {{ language.code.toUpperCase() }}
      </button>
    </div>
  `
})
export class LanguageSwitcherComponent {
  readonly i18n = inject(I18nService);
  readonly languages = LANGUAGE_OPTIONS;

  setLanguage(language: SupportedLanguage): void {
    void this.i18n.setLanguage(language);
  }
}

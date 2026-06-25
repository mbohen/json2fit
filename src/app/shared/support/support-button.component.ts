import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { LucideCoffee } from '@lucide/angular';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { BetaSignalService } from '@features/beta/beta-signal.service';
import { supportConfig } from '@shared/product';

export type SupportButtonAppearance = 'primary' | 'secondary' | 'link';

@Component({
  selector: 'app-support-button',
  standalone: true,
  imports: [CommonModule, I18nPipe, LucideCoffee],
  template: `
    <a
      *ngIf="supportEnabled"
      [href]="supportUrl"
      target="_blank"
      rel="noopener noreferrer"
      [attr.aria-label]="ariaLabel || (label || ('support.button' | t))"
      [ngClass]="buttonClasses"
      (click)="recordSupportClick()"
      data-testid="support-button"
    >
      <svg lucideCoffee class="shrink-0" [size]="16" aria-hidden="true"></svg>
      <span class="min-w-0 break-words">{{ label || ('support.button' | t) }}</span>
    </a>
  `
})
export class SupportButtonComponent {
  private readonly betaSignals = inject(BetaSignalService);

  readonly supportUrl = supportConfig.buyMeACoffeeUrl;
  readonly supportEnabled = supportConfig.enabled;

  @Input() label = '';
  @Input() appearance: SupportButtonAppearance = 'primary';
  @Input() fullWidth = false;
  @Input() ariaLabel?: string;

  get buttonClasses(): string[] {
    const classes =
      this.appearance === 'primary'
        ? ['tool-button', 'tool-button-primary']
        : this.appearance === 'secondary'
          ? ['tool-button', 'tool-button-secondary']
          : [
              'inline-flex',
              'min-w-0',
              'items-center',
              'gap-1.5',
              'rounded-md',
              'text-sm',
              'font-semibold',
              'text-pine',
              'transition-colors',
              'hover:text-emerald-800',
              'focus-visible:outline',
              'focus-visible:outline-2',
              'focus-visible:outline-offset-2',
              'focus-visible:outline-pine'
            ];

    return this.fullWidth ? [...classes, 'w-full', 'justify-center'] : classes;
  }

  recordSupportClick(): void {
    if (!supportConfig.enabled) {
      return;
    }
    this.betaSignals.increment('buy_me_a_coffee_clicked');
  }
}

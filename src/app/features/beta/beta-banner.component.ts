import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { LucideShieldCheck } from '@lucide/angular';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';

@Component({
  selector: 'app-beta-banner',
  standalone: true,
  imports: [CommonModule, I18nPipe, LucideShieldCheck],
  template: `
    <section
      class="min-w-0 rounded-md border p-4 text-left"
      [ngClass]="
        compact
          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
          : 'border-white/15 bg-white/10 text-white'
      "
      data-testid="beta-banner"
    >
      <div class="flex min-w-0 items-start gap-3">
        <svg lucideShieldCheck class="mt-0.5 shrink-0" [size]="20"></svg>
        <div class="min-w-0">
          <p class="font-semibold">{{ 'beta.bannerTitle' | t }}</p>
          <p class="mt-1 break-words text-sm leading-6" [ngClass]="compact ? 'text-emerald-950' : 'text-emerald-50'">
            {{ 'beta.bannerText' | t }}
          </p>
        </div>
      </div>
    </section>
  `
})
export class BetaBannerComponent {
  @Input() compact = false;
}

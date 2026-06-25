import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { LucideCheckCircle2 } from '@lucide/angular';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { I18nService } from '@app/core/i18n/i18n.service';
import {
  BETA_INTEREST_OPTIONS,
  BetaInterestOption,
  BetaInterestPreferenceKey,
  BetaInterestSelection,
  createEmptyBetaInterestSelection
} from './beta-signal.model';
import { BetaSignalService } from './beta-signal.service';

@Component({
  selector: 'app-beta-interest-form',
  standalone: true,
  imports: [CommonModule, I18nPipe, LucideCheckCircle2],
  template: `
    <section class="min-w-0 rounded-lg border border-line bg-white p-5" data-testid="beta-interest-form">
      <div class="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)] lg:items-start">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-pine">{{ 'beta.interestEyebrow' | t }}</p>
          <h2 class="mt-1 break-words text-2xl font-bold text-ink">{{ 'beta.interestTitle' | t }}</h2>
          <p class="mt-3 break-words text-sm leading-6 text-slate-600">
            {{ 'beta.interestLead' | t }}
          </p>
          <p class="mt-3 break-words text-sm leading-6 text-slate-600">
            {{ 'beta.interestPrivacy' | t }}
          </p>
        </div>

        <form class="min-w-0 space-y-3" (submit)="savePreferences($event)">
          <div class="grid min-w-0 gap-2 sm:grid-cols-2">
            <label
              *ngFor="let option of options; trackBy: trackByOption"
              class="flex min-w-0 items-start gap-3 rounded-md border border-line px-3 py-3 text-sm"
            >
              <input
                class="mt-0.5 size-4 shrink-0 accent-emerald-700"
                type="checkbox"
                [checked]="selection()[option.key]"
                (change)="onPreferenceChange(option.key, $event)"
              />
              <span class="break-words font-medium text-ink">{{ option.labelKey | t }}</span>
            </label>
          </div>

          <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <button class="tool-button tool-button-primary w-full sm:w-auto" type="submit">
              <svg lucideCheckCircle2 [size]="18"></svg>
              <span>{{ 'beta.savePreferences' | t }}</span>
            </button>
            <p *ngIf="savedMessage()" class="break-words text-sm font-semibold text-emerald-800" data-testid="beta-interest-saved-message">
              {{ savedMessage() }}
            </p>
          </div>
        </form>
      </div>
    </section>
  `
})
export class BetaInterestFormComponent {
  private readonly betaSignals = inject(BetaSignalService);
  private readonly i18n = inject(I18nService);

  readonly options = BETA_INTEREST_OPTIONS;
  readonly savedMessage = signal<string | null>(null);
  readonly selection = signal<BetaInterestSelection>(createEmptyBetaInterestSelection());

  onPreferenceChange(key: BetaInterestPreferenceKey, event: Event): void {
    this.selection.update((current) => ({
      ...current,
      [key]: (event.target as HTMLInputElement).checked
    }));
    this.savedMessage.set(null);
  }

  savePreferences(event: Event): void {
    event.preventDefault();
    const saved = this.betaSignals.saveInterestPreferences(this.selection());
    this.selection.set(initialSelection(saved));
    this.savedMessage.set(this.i18n.t('beta.savedMessage'));
  }

  trackByOption(_: number, option: BetaInterestOption): string {
    return option.key;
  }
}

function initialSelection(preferences: Partial<BetaInterestSelection> | null): BetaInterestSelection {
  return {
    ...createEmptyBetaInterestSelection(),
    ...preferences
  };
}

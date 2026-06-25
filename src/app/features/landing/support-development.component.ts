import { Component } from '@angular/core';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { SupportButtonComponent } from '@app/shared/support/support-button.component';

@Component({
  selector: 'app-support-development',
  standalone: true,
  imports: [I18nPipe, SupportButtonComponent],
  template: `
    <section id="support" class="bg-white px-4 py-12 sm:px-5 lg:py-16" data-testid="landing-support">
      <div class="mx-auto max-w-6xl">
        <div class="min-w-0 rounded-lg border border-line bg-slate-50 p-5 sm:p-6">
          <div class="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-pine">{{ 'support.headingEyebrow' | t }}</p>
              <h2 class="mt-2 break-words text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                {{ 'support.heading' | t }}
              </h2>
              <p class="mt-3 max-w-3xl break-words text-sm leading-6 text-slate-600">
                {{ 'support.lead' | t }}
              </p>
              <p class="mt-2 break-words text-sm font-semibold text-slate-700">
                {{ 'support.note' | t }}
              </p>
            </div>
            <app-support-button
              class="block w-full md:w-auto"
              [fullWidth]="true"
              [ariaLabel]="'support.buttonAria' | t"
            ></app-support-button>
          </div>
        </div>
      </div>
    </section>
  `
})
export class SupportDevelopmentComponent {}

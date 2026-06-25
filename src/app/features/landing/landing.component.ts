import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideCheckCircle2,
  LucideShieldCheck,
  LucideUploadCloud
} from '@lucide/angular';
import { BetaSignalService } from '@features/beta/beta-signal.service';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { I18nService } from '@app/core/i18n/i18n.service';
import { SupportDevelopmentComponent } from './support-development.component';

interface LandingCard {
  title: string;
  text: string;
}

interface OutputFormatCard extends LandingCard {
  name: string;
  label: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    I18nPipe,
    LucideArrowRight,
    LucideCheckCircle2,
    LucideShieldCheck,
    LucideUploadCloud,
    SupportDevelopmentComponent
  ],
  templateUrl: './landing.component.html'
})
export class LandingComponent {
  private readonly betaSignals = inject(BetaSignalService);
  private readonly i18n = inject(I18nService);

  readonly howItWorksSteps = computed(() => this.i18n.list<LandingCard>('landing.steps'));

  readonly outputFormats = computed(() => this.i18n.list<OutputFormatCard>('landing.outputFormats'));

  readonly limitations = computed(() => this.i18n.list<string>('landing.limitations'));

  constructor() {
    this.betaSignals.increment('landing_view');
  }
}

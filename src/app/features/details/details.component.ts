import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  LucideAlertTriangle,
  LucideBarChart3,
  LucideCheckCircle2,
  LucideDownload,
  LucideFileArchive,
  LucideFileInput,
  LucideHeartPulse,
  LucideMap,
  LucideUploadCloud
} from '@lucide/angular';
import { BetaInterestFormComponent } from '@features/beta/beta-interest-form.component';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { I18nService } from '@app/core/i18n/i18n.service';

interface DetailsStep {
  title: string;
  text: string;
  icon: 'file' | 'upload' | 'download' | 'check';
}

interface DetailsFaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-details',
  standalone: true,
  imports: [
    CommonModule,
    I18nPipe,
    LucideAlertTriangle,
    LucideBarChart3,
    LucideCheckCircle2,
    LucideDownload,
    LucideFileArchive,
    LucideFileInput,
    LucideHeartPulse,
    LucideMap,
    LucideUploadCloud,
    BetaInterestFormComponent
  ],
  templateUrl: './details.component.html'
})
export class DetailsComponent {
  private readonly i18n = inject(I18nService);

  readonly steps = computed(() => this.i18n.list<DetailsStep>('details.steps'));
  readonly supportedData = computed(() => this.i18n.list<string>('details.supportedData'));
  readonly limitations = computed(() => this.i18n.list<string>('details.limitations'));
  readonly faq = computed(() => this.i18n.list<DetailsFaqItem>('details.faq'));
}

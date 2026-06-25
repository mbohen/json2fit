import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { I18nService } from '@app/core/i18n/i18n.service';
import { HELP_SECTIONS, HELP_TERMS, HelpSectionId, HelpTermKey, helpSectionTitleKey } from '@app/shared/help/help-content';
import { TermTooltipComponent } from '@app/shared/help/term-tooltip.component';

interface HelpFaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, I18nPipe, RouterLink, TermTooltipComponent],
  templateUrl: './help.component.html'
})
export class HelpComponent {
  private readonly i18n = inject(I18nService);

  readonly sections = HELP_SECTIONS;
  readonly terms = HELP_TERMS;
  readonly faq = computed(() => this.i18n.list<HelpFaqItem>('help.faq'));

  title(section: { id: HelpSectionId }): string {
    return this.i18n.t(helpSectionTitleKey(section.id));
  }

  summary(section: { id: HelpSectionId }): string {
    return this.i18n.t(`help.sections.${section.id}.summary`);
  }

  steps(section: { id: HelpSectionId }): readonly string[] {
    return this.i18n.list<string>(`help.sections.${section.id}.steps`);
  }

  notes(section: { id: HelpSectionId }): readonly string[] {
    return this.i18n.list<string>(`help.sections.${section.id}.notes`);
  }

  externalLabel(section: { id: HelpSectionId }): string {
    return this.i18n.t(`help.sections.${section.id}.externalLabel`);
  }

  termSummary(term: HelpTermKey): string {
    return this.i18n.t(`help.termSummaries.${term}`);
  }
}

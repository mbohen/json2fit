import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { I18nService } from '@app/core/i18n/i18n.service';
import { inject } from '@angular/core';
import { HelpSectionId, helpSectionTitleKey } from './help-content';

@Component({
  selector: 'app-help-link',
  standalone: true,
  imports: [I18nPipe, RouterLink],
  template: `
    <a
      class="inline-flex min-w-0 items-center gap-1 font-semibold text-pine underline decoration-dotted underline-offset-4 hover:text-emerald-800"
      [routerLink]="['/help']"
      [fragment]="section"
      [attr.aria-label]="'help.moreAria' | t: { label: label }"
    >
      <span>{{ 'help.more' | t }}</span>
    </a>
  `
})
export class HelpLinkComponent {
  private readonly i18n = inject(I18nService);

  @Input({ required: true }) section!: HelpSectionId;

  get label(): string {
    return this.i18n.t(helpSectionTitleKey(this.section));
  }
}

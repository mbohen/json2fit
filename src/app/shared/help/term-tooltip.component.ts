import { Component, Input } from '@angular/core';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { HelpTermKey } from './help-content';

@Component({
  selector: 'app-term-tooltip',
  standalone: true,
  imports: [I18nPipe],
  template: `
    <abbr
      class="cursor-help rounded-sm border-b border-dotted border-pine text-inherit no-underline"
      [attr.title]="'help.terms.' + term | t"
      [attr.aria-label]="term + ': ' + ('help.terms.' + term | t)"
    >
      <ng-content></ng-content>
    </abbr>
  `
})
export class TermTooltipComponent {
  @Input({ required: true }) term!: HelpTermKey;
}

import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';
import { TranslationParams } from './i18n.model';

@Pipe({
  name: 't',
  standalone: true,
  pure: false
})
export class I18nPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: string | null | undefined, params?: TranslationParams): string {
    return key ? this.i18n.t(key, params) : '';
  }
}

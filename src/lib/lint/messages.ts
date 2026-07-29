import type { InterfaceLocale } from '../language-policy';
import type { LintContext } from './types';

export function lintText(
  localeOrContext: InterfaceLocale | Pick<LintContext, 'interfaceLocale'>,
  zhTW: string,
  en: string,
): string {
  const locale = typeof localeOrContext === 'string'
    ? localeOrContext
    : (localeOrContext.interfaceLocale ?? 'zh-TW');
  return locale === 'en' ? en : zhTW;
}

export function lintChapterLabel(
  context: Pick<LintContext, 'interfaceLocale'>,
  title: string,
): string {
  return lintText(context, `章節 ${title}`, `Chapter ${title}`);
}

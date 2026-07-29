import * as PromptsZH from './prompt-defaults-zh';
import * as PromptsEN from './prompt-defaults-en';
import type { InterfaceLocale } from './language-policy';

export * from './prompt-defaults-zh';

export function getBuiltInPrompts(locale: InterfaceLocale) {
  return locale === 'en' ? PromptsEN : PromptsZH;
}

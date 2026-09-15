/// <reference path="../.astro/types.d.ts" />

import type { Translator } from './i18n/t';
import type { Locale } from './i18n/config';

declare global {
  namespace App {
    interface Locals {
      /** Active locale resolved from the `locale` cookie. */
      locale: Locale;
      /** Translator function bound to the active locale. */
      t: Translator;
    }
  }
}
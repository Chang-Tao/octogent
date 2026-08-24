import type { Locale } from "@octogent/core";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { LocaleProvider } from "../../src/app/providers/LocaleProvider";

/**
 * Renders a tree inside a locale provider pinned to a fixed locale (English by
 * default) so assertions can rely on catalog wording. Components read their
 * copy through useT(); rendered bare they fall back to the context default,
 * which emits raw i18n keys instead of text.
 */
export const renderWithLocale = (ui: ReactElement, locale: Locale = "en") =>
  render(
    <LocaleProvider locale={locale} setLocale={() => {}}>
      {ui}
    </LocaleProvider>,
  );

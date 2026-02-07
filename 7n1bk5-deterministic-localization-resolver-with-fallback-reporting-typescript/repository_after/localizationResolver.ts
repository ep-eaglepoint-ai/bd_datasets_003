
export type ResolveInput = {
    key: string;
    translationMap: Record<string, Record<string, string>>;
    userLocales: string[];
    defaultLocale: string;
};

export type ResolveIssue = {
    type: 'MISSING_TRANSLATION' | 'UNKNOWN_LOCALE';
    locale: string;
    path: string[];
};

export type ResolveResult =
    | {
        ok: true;
        value: string;
        localeUsed: string;
        fallbackPath: string[];
    }
    | {
        ok: false;
        fallbackPath: string[];
        reasons: ResolveIssue[];
    };

export function resolveLocalizedString(input: ResolveInput): ResolveResult {
    // Example: Successful resolution using preferred locale
    // resolveLocalizedString({
    //   key: 'hello',
    //   translationMap: { 'fr-FR': { hello: 'Bonjour' }, 'en-US': { hello: 'Hello' } },
    //   userLocales: ['fr-FR'],
    //   defaultLocale: 'en-US'
    // }) -> { ok: true, value: 'Bonjour', localeUsed: 'fr-FR', fallbackPath: ['fr-FR'] }

    // Example: Successful resolution using fallback locale
    // resolveLocalizedString({
    //   key: 'hello',
    //   translationMap: { 'en-US': { hello: 'Hello' } },
    //   userLocales: ['fr-FR'],
    //   defaultLocale: 'en-US'
    // }) -> { ok: true, value: 'Hello', localeUsed: 'en-US', fallbackPath: ['fr-FR', 'en-US'] }

    // Example: Failure when no translation is available
    // resolveLocalizedString({
    //   key: 'hello',
    //   translationMap: { 'en-US': { goodbye: 'Bye' } },
    //   userLocales: ['fr-FR'],
    //   defaultLocale: 'en-US'
    // }) -> {
    //   ok: false,
    //   fallbackPath: ['fr-FR', 'en-US'],
    //   reasons: [
    //     { type: 'UNKNOWN_LOCALE', locale: 'fr-FR', path: ['fr-FR'] },
    //     { type: 'MISSING_TRANSLATION', locale: 'en-US', path: ['fr-FR', 'en-US'] }
    //   ]
    // }

    const { key, translationMap, userLocales, defaultLocale } = input;
    const fallbackPath: string[] = [];
    const reasons: ResolveIssue[] = [];
    const localesToTry = Array.from(new Set([...userLocales, defaultLocale]));

    for (const locale of localesToTry) {
        fallbackPath.push(locale);

        if (!Object.prototype.hasOwnProperty.call(translationMap, locale)) {
            reasons.push({ type: 'UNKNOWN_LOCALE', locale, path: [...fallbackPath] });
            continue;
        }

        const translations = translationMap[locale];
        if (!Object.prototype.hasOwnProperty.call(translations, key)) {
            reasons.push({ type: 'MISSING_TRANSLATION', locale, path: [...fallbackPath] });
            continue;
        }

        return {
            ok: true,
            value: translations[key],
            localeUsed: locale,
            fallbackPath,
        };
    }

    return {
        ok: false,
        fallbackPath,
        reasons,
    };
}

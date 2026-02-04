
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

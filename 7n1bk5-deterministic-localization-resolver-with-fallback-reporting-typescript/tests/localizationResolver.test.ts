
import { strict as assert } from 'assert';
import { resolveLocalizedString, ResolveInput, ResolveResult } from '../repository_after/localizationResolver.ts';

// Simple types for testing
type TestCase = {
    name: string;
    input: ResolveInput;
    expected: Partial<ResolveResult>;
};

function runTests() {
    console.log('Running Localization Resolver Tests...\n');
    let passed = 0;
    let failed = 0;

    const testCases: TestCase[] = [
        {
            name: 'Success: User Preferred Locale Exists',
            input: {
                key: 'hello',
                translationMap: {
                    'en-US': { hello: 'Hello' },
                    'fr-FR': { hello: 'Bonjour' },
                },
                userLocales: ['fr-FR', 'en-US'],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: true,
                value: 'Bonjour',
                localeUsed: 'fr-FR',
                fallbackPath: ['fr-FR'],
            },
        },
        {
            name: 'Success: Fallback to Second Preference',
            input: {
                key: 'hello',
                translationMap: {
                    'en-US': { hello: 'Hello' },
                },
                userLocales: ['fr-FR', 'en-US'],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: true,
                value: 'Hello',
                localeUsed: 'en-US',
                fallbackPath: ['fr-FR', 'en-US'],
            },
        },
        {
            name: 'Success: Fallback to Default',
            input: {
                key: 'hello',
                translationMap: {
                    'es-ES': { hello: 'Hola' },
                },
                userLocales: ['fr-FR', 'de-DE'],
                defaultLocale: 'es-ES',
            },
            expected: {
                ok: true,
                value: 'Hola',
                localeUsed: 'es-ES',
                fallbackPath: ['fr-FR', 'de-DE', 'es-ES'],
            },
        },
        {
            name: 'Failure: Missing Translation Key',
            input: {
                key: 'hello',
                translationMap: {
                    'en-US': { goodbye: 'Goodbye' },
                },
                userLocales: ['en-US'],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: false,
                fallbackPath: ['en-US'],
                // Partial match on reasons
            },
        },
        {
            name: 'Failure: Unknown Locale',
            input: {
                key: 'hello',
                translationMap: {},
                userLocales: ['fr-FR'],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: false,
                fallbackPath: ['fr-FR', 'en-US'],
            },
        },
        {
            name: 'Edge Case: Duplicate User Locales (Should only try once)',
            input: {
                key: 'missing',
                translationMap: { 'en-US': {} },
                userLocales: ['en-US', 'en-US'],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: false,
                fallbackPath: ['en-US'], // Should not be ['en-US', 'en-US', 'en-US']
            },
        },
        {
            name: 'Edge Case: Default matches a User Locale (Should not duplicate)',
            input: {
                key: 'missing',
                translationMap: { 'en-US': {} },
                userLocales: ['en-US'],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: false,
                fallbackPath: ['en-US'], // Should be ['en-US'] not ['en-US', 'en-US']
            },
        },
        {
            name: 'Security: Prototype Pollution Check',
            input: {
                key: 'toString', // Exists on Object.prototype
                translationMap: {},
                userLocales: ['en-US'],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: false,
                fallbackPath: ['en-US'],
            },
        },
        {
            name: 'Edge Case: Case Sensitivity (Exact Match Required)',
            input: {
                key: 'hello',
                translationMap: {
                    'en-us': { hello: 'Hello' }, // Lowercase locale
                },
                userLocales: ['en-US'], // Uppercase locale
                defaultLocale: 'en-US',
            },
            expected: {
                ok: false, // Should fail because 'en-US' !== 'en-us'
                fallbackPath: ['en-US'],
            },
        },
        {
            name: 'Complex: Multiple Missing Locales and One Success',
            input: {
                key: 'hello',
                translationMap: {
                    'de-DE': { hello: 'Hallo' },
                },
                userLocales: ['fr-FR', 'es-ES', 'de-DE'],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: true,
                value: 'Hallo',
                localeUsed: 'de-DE',
                fallbackPath: ['fr-FR', 'es-ES', 'de-DE'],
            },
        },
        {
            name: 'Edge Case: Empty Inputs',
            input: {
                key: 'anything',
                translationMap: {},
                userLocales: [],
                defaultLocale: 'en-US',
            },
            expected: {
                ok: false,
                fallbackPath: ['en-US'],
            },
        }
    ];

    for (const test of testCases) {
        try {
            const actual = resolveLocalizedString(test.input);

            // Basic assertions
            assert.equal(actual.ok, test.expected.ok, `Expected ok=${test.expected.ok}, got ${actual.ok}`);

            if (test.expected.ok) {
                // @ts-ignore
                assert.equal(actual.value, test.expected.value, `Expected value='${test.expected.value}', got '${actual.value}'`);
                // @ts-ignore
                assert.equal(actual.localeUsed, test.expected.localeUsed, `Expected localeUsed='${test.expected.localeUsed}', got '${actual.localeUsed}'`);
            }

            assert.deepStrictEqual(actual.fallbackPath, test.expected.fallbackPath, `Expected fallbackPath=[${test.expected.fallbackPath}], got [${actual.fallbackPath}]`);

            console.log(`PASS: ${test.name}`);
            passed++;
        } catch (e: any) {
            console.error(`FAIL: ${test.name}`);
            console.error(`  ${e.message}`);
            console.error(`  Expected: ${JSON.stringify(test.expected, null, 2)}`);
            console.error(`  Actual:   ${JSON.stringify(e.actual || 'error', null, 2)}`); // Try to log actual if available
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();

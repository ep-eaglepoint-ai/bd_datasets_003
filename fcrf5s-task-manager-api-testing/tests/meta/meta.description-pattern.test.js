const path = require('path')
const {
	findInvalidDescriptions,
	DESCRIPTION_REGEX,
} = require('../helpers/descriptionRules')

describe('Meta: test description pattern', () => {
	it('should enforce BDD description pattern when validating all test descriptions', () => {
		const testsRoot = path.resolve(__dirname, '..')

		const invalid = findInvalidDescriptions(testsRoot)

		if (invalid.length > 0) {
			const formatted = invalid
				.map((e) => `File: ${e.file}\n  Invalid: "${e.description}"`)
				.join('\n\n')

			throw new Error(
				`Invalid test descriptions detected.\n\n` +
					`Required pattern:\n` +
					`"should [verb] [expected outcome] when [condition]"\n\n` +
					`Regex:\n${DESCRIPTION_REGEX}\n\n` +
					`Violations:\n\n${formatted}`,
			)
		}
	})
})

/**
 * Test fixtures for text manipulation tests
 */

export const textFixtures = {
  // Fixtures for trim tests
  withLeadingSpaces: '   Hello World',
  withTrailingSpaces: 'Hello World   ',
  withBothSpaces: '   Hello World   ',
  withMultipleInternalSpaces: 'Hello    World    Test',
  withNewlines: 'Hello\nWorld\nTest',
  withTabs: 'Hello\tWorld\tTest',
  withMixedWhitespace: '  Hello   \t  World  \n  Test  ',
  emptyString: '',
  onlySpaces: '     ',

  // Expected results after trimming
  trimmed: {
    withLeadingSpaces: 'Hello World',
    withTrailingSpaces: 'Hello World',
    withBothSpaces: 'Hello World',
    withMultipleInternalSpaces: 'Hello World Test', // collapsed
    withNewlines: 'Hello World Test', // normalized
    withTabs: 'Hello World Test', // normalized
    withMixedWhitespace: 'Hello World Test', // fully normalized
    emptyString: '',
    onlySpaces: '',
  },

  // Fixtures for editor content
  editorContent: {
    simple: 'Hello, this is a test',
    withPunctuation: 'Hello! This is a test, right?',
    multiline: 'Line 1\nLine 2\nLine 3',
    withNumbers: 'Test 123 with numbers 456',
    withSpecialChars: 'Test@#$%^&*()_+',
    longText: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10),
  },
}

export const videoUrlFixtures = {
  validVideoUrl: 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAACKBtZGF0AAAC',
  invalidVideoUrl: 'invalid-url',
  blobUrl: 'blob:http://localhost:3000/12345-67890',
}

export const styleFixtures = {
  default: {
    color: '#000000',
    fontSize: 16,
  },
  large: {
    color: '#ff0000',
    fontSize: 32,
  },
  small: {
    color: '#0000ff',
    fontSize: 12,
  },
}

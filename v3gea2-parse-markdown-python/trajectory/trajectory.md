# Trajectory


## The Problem: Implement lightweight markdown parser to replace third-party library

currently to documntation site generator uses third-party markdown library to converst markdown files to HTML, This library is large (~500 KB) and includes features that are not needed for our documentation.
The team wants to have parser that 
- handles only the subset of Markdown syntax actually used in the documentation: 
    * ##headings
    * paragraphs, 
    * Bold **bold** or __bold__
    * Italic _italic_
    * Links (links),
    * Inline code and code blocks `code blocks`
    * Ordered and unordered lists, including nested lists 
The system needs to parse markdown text and output valid HTML, handle nested formatting like bold text inside a link, and avoid XSS vulnerabilities from user-provided content.

## The Solution: Implement a custom Markdown parser that only handle the required syntax

We will build a from-scratch parser that:
1. Parses line-by-line to detect headings, paragraphs, lists, horizontal rules, and code blocks.
2. Implements a character-level inline parser for bold, italic, links, and inline code.
3. Uses escaping to prevent XSS and ensures HTML is valid.
4. Supports nested lists and nested formatting within inline elements.
5. Avoids external dependencies, reducing bundle size and increasing performance.
6. Exposes a single function: `parse_markdown(markdown: str)-> str`

### Recommended Resources
Python html.escape - for safe escaping
Markdown syntax guide - reference for supported syntax
Recursive descent parsing - parsing technique


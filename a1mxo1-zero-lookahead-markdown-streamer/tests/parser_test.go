package tests

import (
	"bytes"
	"testing"
	"my-module/repository_after"
)

func TestStreamParser(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		// --- Existing Tests ---
		{"H1", "# Hello", "<h1>Hello</h1>"},
		{"H6", "###### Title", "<h6>Title</h6>"},
		{"Not a Header", "###NotHeader", "###NotHeader"},
		{"Bold Text", "This is **bold**", "This is <b>bold</b>"},
		{"Italic Text", "This is *italic*", "This is <i>italic</i>"},
		{"Bold Italic", "***bold italic***", "<b><i>bold italic</i></b>"},
		{"Unordered List", "- Item 1\n- Item 2", "<ul><li>Item 1</li><li>Item 2</li></ul>"},
		{"List with Bold", "- Item **Bold**", "<ul><li>Item <b>Bold</b></li></ul>"},
		{"Mixed Format", "# Title\n- *Item*", "<h1>Title</h1>\n<ul><li><i>Item</i></li></ul>"},
		{"UTF-8 Check", "## Hello 世界", "<h2>Hello 世界</h2>"},

		// --- NEW: Core Link Requirements ---
		{"Basic Link", "[Google](https://google.com)", "<a href=\"https://google.com\">Google</a>"},
		{"Link with Spaces", "[Go Project](https://go.dev)", "<a href=\"https://go.dev\">Go Project</a>"},
		{"UTF-8 Link", "[维基百科](https://zh.wikipedia.org)", "<a href=\"https://zh.wikipedia.org\">维基百科</a>"},

		// --- NEW: Link Edge Cases (Broken Syntax) ---
		{"Broken Link: No Parens", "[Only Text]", "[Only Text]"},
		{"Broken Link: Unclosed Bracket", "[Text(url)", "[Text(url)"},
		{"Broken Link: Unclosed Paren", "[Text](url", "[Text](url"},
		{"Broken Link: Space Between", "[Text] (url)", "[Text] (url)"},
		{"Empty Link", "[]()", "<a href=\"\"></a>"},

		// --- NEW: Complex Nested Scenarios ---
		{"Bold Inside Link", "[**Bold** Link](https://test.com)", "<a href=\"https://test.com\"><b>Bold</b> Link</a>"},
		{"Link Inside Header", "## [Header Link](https://go.dev)", "<h2><a href=\"https://go.dev\">Header Link</a></h2>"},
		{"Link Inside List", "- Check [this](link)", "<ul><li>Check <a href=\"link\">this</a></li></ul>"},
		{"Multiple Links In Line", "[A](1) and [B](2)", "<a href=\"1\">A</a> and <a href=\"2\">B</a>"},
		
		// --- Stress Testing Implementation Trajectory ---
		{"Link with Special Chars", "[Search](https://s.com?q=go+lang&lang=en)", "<a href=\"https://s.com?q=go+lang&lang=en\">Search</a>"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &repository_after.StreamParser{}
			var out bytes.Buffer
			
			// Wrapping in a safety check for potential infinite loops in stream parsing
			err := p.Parse(bytes.NewBufferString(tt.input), &out)
			
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
			
			if out.String() != tt.expected {
				t.Errorf("\nInput: %q\nExpected: %q\nGot:      %q", tt.input, tt.expected, out.String())
			}
		})
	}
}
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
		{"Trailing Asterisks", "This is bold **", "This is bold <b></b>"},
		{"Broken Link Style", "Text *italic without end", "Text <i>italic without end"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &repository_after.StreamParser{}
			var out bytes.Buffer
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
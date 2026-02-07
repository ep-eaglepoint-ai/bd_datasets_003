package repository_after

import (
	"bufio"
	"fmt"
	"io"
)

type State int

const (
	StateStartOfLine State = iota
	StateInText
)

type StreamParser struct {
	state  State
	inList bool
}

type RuneReader interface {
	ReadRune() (rune, int, error)
	UnreadRune() error
}

func (p *StreamParser) Parse(r io.Reader, w io.Writer) error {
	br := bufio.NewReader(r)
	bw := bufio.NewWriter(w)
	defer bw.Flush()

	p.state = StateStartOfLine
	p.inList = false

	for {
		rn, _, err := br.ReadRune()
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}

		switch p.state {
		case StateStartOfLine:
			if rn == '#' {
				p.closeList(bw)
				p.handleHeader(rn, br, bw)
			} else if rn == '-' {
				p.handleList(rn, br, bw)
			} else if rn == '\n' {
				p.closeList(bw)
				bw.WriteRune(rn)
			} else {
				p.closeList(bw)
				p.state = StateInText
				p.handleInline(rn, br, bw)
			}
		case StateInText:
			if rn == '\n' {
				p.state = StateStartOfLine
				bw.WriteRune(rn)
			} else {
				p.handleInline(rn, br, bw)
			}
		}
	}

	p.closeList(bw)
	return nil
}

func (p *StreamParser) handleHeader(first rune, br *bufio.Reader, bw *bufio.Writer) {
	level := 1
	for level < 6 {
		next, _, _ := br.ReadRune()
		if next == '#' {
			level++
		} else if next == ' ' {
			fmt.Fprintf(bw, "<h%d>", level)
			p.consumeUntilNewline(br, bw, fmt.Sprintf("</h%d>", level))
			return
		} else {
			for i := 0; i < level; i++ {
				bw.WriteRune('#')
			}
			p.state = StateInText
			p.handleInline(next, br, bw)
			return
		}
	}

	next, _, _ := br.ReadRune()
	if next == ' ' {
		bw.WriteString("<h6>")
		p.consumeUntilNewline(br, bw, "</h6>")
	} else {
		bw.WriteString("######")
		p.state = StateInText
		p.handleInline(next, br, bw)
	}
}

func (p *StreamParser) handleList(first rune, br *bufio.Reader, bw *bufio.Writer) {
	next, _, _ := br.ReadRune()
	if next == ' ' {
		if !p.inList {
			bw.WriteString("<ul>")
			p.inList = true
		}
		bw.WriteString("<li>")
		p.consumeUntilNewline(br, bw, "</li>")
	} else {
		bw.WriteRune(first)
		p.state = StateInText
		p.handleInline(next, br, bw)
	}
}

func (p *StreamParser) handleInline(rn rune, br RuneReader, bw *bufio.Writer) {
	switch rn {
	case '*':
		p.handleEmphasis(rn, br, bw)
	case '[':
		// Only real stream supports links
		if realBR, ok := br.(*bufio.Reader); ok {
			p.handleLink(realBR, bw)
		} else {
			bw.WriteRune('[')
		}
	default:
		bw.WriteRune(rn)
	}
}

func (p *StreamParser) handleEmphasis(rn rune, br RuneReader, bw *bufio.Writer) {
	next, _, err := br.ReadRune()
	if err != nil {
		bw.WriteRune(rn)
		return
	}

	if next == '*' {
		third, _, err := br.ReadRune()
		if err == nil && third == '*' {
			bw.WriteString("<b><i>")
			p.consumeInline(br, bw, "</i></b>", 3, true)
		} else {
			if err == nil {
				br.UnreadRune()
			}
			bw.WriteString("<b>")
			p.consumeInline(br, bw, "</b>", 2, true)
		}
	} else {
		br.UnreadRune()
		bw.WriteString("<i>")
		p.consumeInline(br, bw, "</i>", 1, false)
	}
}

func (p *StreamParser) handleLink(br *bufio.Reader, bw *bufio.Writer) {
	var textBuf []rune
	for {
		rn, _, err := br.ReadRune()
		if err != nil || rn == '\n' {
			bw.WriteRune('[')
			bw.WriteString(string(textBuf))
			if rn == '\n' {
				br.UnreadRune()
			}
			return
		}
		if rn == ']' {
			break
		}
		textBuf = append(textBuf, rn)
	}

	next, _, _ := br.ReadRune()
	if next != '(' {
		bw.WriteRune('[')
		bw.WriteString(string(textBuf))
		bw.WriteRune(']')
		br.UnreadRune()
		return
	}

	var urlBuf []rune
	for {
		rn, _, err := br.ReadRune()
		if err != nil || rn == '\n' {
			bw.WriteString("[")
			bw.WriteString(string(textBuf))
			bw.WriteString("](")
			bw.WriteString(string(urlBuf))
			if rn == '\n' {
				br.UnreadRune()
			}
			return
		}
		if rn == ')' {
			break
		}
		urlBuf = append(urlBuf, rn)
	}

	fmt.Fprintf(bw, "<a href=\"%s\">", string(urlBuf))

	innerReader := javaStringReader(string(textBuf))
	for {
		r, _, err := innerReader.ReadRune()
		if err == io.EOF {
			break
		}
		p.handleInline(r, innerReader, bw)
	}

	bw.WriteString("</a>")
}

type stringReader struct {
	str []rune
	pos int
}

func (r *stringReader) Read(p []byte) (n int, err error) { return 0, io.EOF }
func (r *stringReader) ReadRune() (rune, int, error) {
	if r.pos >= len(r.str) {
		return 0, 0, io.EOF
	}
	rn := r.str[r.pos]
	r.pos++
	return rn, 0, nil
}
func (r *stringReader) UnreadRune() error {
	if r.pos <= 0 {
		return fmt.Errorf("cannot unread")
	}
	r.pos--
	return nil
}
func javaStringReader(s string) *stringReader {
	return &stringReader{str: []rune(s)}
}

func (p *StreamParser) consumeUntilNewline(br *bufio.Reader, bw *bufio.Writer, tagClose string) {
	for {
		rn, _, err := br.ReadRune()
		if err == io.EOF || rn == '\n' {
			bw.WriteString(tagClose)
			if rn == '\n' {
				p.state = StateStartOfLine
				if !p.inList {
					bw.WriteRune('\n')
				}
			}
			return
		}
		p.handleInline(rn, br, bw)
	}
}

func (p *StreamParser) consumeInline(
	br RuneReader,
	bw *bufio.Writer,
	tagClose string,
	markerCount int,
	forceClose bool,
) {
	for {
		rn, _, err := br.ReadRune()
		if err == io.EOF || rn == '\n' {
			if forceClose {
				bw.WriteString(tagClose)
			}
			if rn == '\n' {
				br.UnreadRune()
			}
			return
		}

		if rn == '*' {
			count := 1
			for count < markerCount {
				next, _, _ := br.ReadRune()
				if next == '*' {
					count++
				} else {
					br.UnreadRune()
					break
				}
			}
			if count == markerCount {
				bw.WriteString(tagClose)
				return
			}
			for i := 0; i < count; i++ {
				bw.WriteRune('*')
			}
		} else {
			bw.WriteRune(rn)
		}
	}
}

func (p *StreamParser) closeList(bw *bufio.Writer) {
	if p.inList {
		bw.WriteString("</ul>")
		p.inList = false
	}
}

package matcher

import (
	"fmt"
	"unicode/utf8"
)

// Match returns true only if target matches includePattern and does not match
// any pattern in poisonPatterns.
//
// Supported syntax (custom, no regexp/path/filepath):
//   - ?: matches exactly one non-'/' character
//   - *: matches zero or more non-'/' characters
//   - **: recursive wildcard (matches zero or more path segments)
//   - (a|b|c): selection group of literal alternatives
func Match(includePattern string, target string, poisonPatterns []string) (bool, error) {
	includeTokens, err := parsePattern(includePattern)
	if err != nil {
		return false, fmt.Errorf("include pattern: %w", err)
	}

	for _, poison := range poisonPatterns {
		poisonTokens, err := parsePattern(poison)
		if err != nil {
			return false, fmt.Errorf("poison pattern %q: %w", poison, err)
		}
		if matchTokens(poisonTokens, target) {
			return false, nil
		}
	}

	return matchTokens(includeTokens, target), nil
}

type tokenKind uint8

const (
	tokLiteral tokenKind = iota
	tokQuestion
	tokStar
	tokDoubleStar
	tokGroup
)

type token struct {
	kind tokenKind
	lit  string
	alts []string
}

func parsePattern(pattern string) ([]token, error) {
	// Keep tokens small; avoid allocations unless groups are present.
	var tokens []token
	flushLiteral := func(start, end int) {
		if start < end {
			tokens = append(tokens, token{kind: tokLiteral, lit: pattern[start:end]})
		}
	}

	literalStart := 0
	for i := 0; i < len(pattern); {
		switch pattern[i] {
		case '?':
			flushLiteral(literalStart, i)
			tokens = append(tokens, token{kind: tokQuestion})
			i++
			literalStart = i
		case '*':
			flushLiteral(literalStart, i)
			if i+1 < len(pattern) && pattern[i+1] == '*' {
				tokens = append(tokens, token{kind: tokDoubleStar})
				i += 2
			} else {
				tokens = append(tokens, token{kind: tokStar})
				i++
			}
			literalStart = i
		case '(':
			flushLiteral(literalStart, i)
			g, next, err := parseGroup(pattern, i)
			if err != nil {
				return nil, err
			}
			tokens = append(tokens, g)
			i = next
			literalStart = i
		case '/':
			flushLiteral(literalStart, i)
			tokens = append(tokens, token{kind: tokLiteral, lit: "/"})
			i++
			literalStart = i
		default:
			i++
		}
	}
	flushLiteral(literalStart, len(pattern))

	// Normalize consecutive ** tokens.
	if len(tokens) <= 1 {
		return tokens, nil
	}
	out := tokens[:0]
	for _, t := range tokens {
		if t.kind == tokDoubleStar && len(out) > 0 && out[len(out)-1].kind == tokDoubleStar {
			continue
		}
		out = append(out, t)
	}
	return out, nil
}

func parseGroup(pattern string, openIdx int) (token, int, error) {
	// No nesting is required; we scan to the next ')'.
	i := openIdx + 1
	for i < len(pattern) && pattern[i] != ')' {
		i++
	}
	if i >= len(pattern) || pattern[i] != ')' {
		return token{}, 0, fmt.Errorf("unterminated group starting at %d", openIdx)
	}
	inside := pattern[openIdx+1 : i]
	// Split on '|'. Allow empty alternatives.
	var alts []string
	start := 0
	for j := 0; j <= len(inside); j++ {
		if j == len(inside) || inside[j] == '|' {
			alts = append(alts, inside[start:j])
			start = j + 1
		}
	}
	return token{kind: tokGroup, alts: alts}, i + 1, nil
}

type state struct {
	pi int
	ti int
}

type visitedSet struct {
	small    [256]uint64
	smallLen int
	m        map[uint64]struct{}
}

// seenOrAdd returns true if key was already present; otherwise adds and returns false.
func (v *visitedSet) seenOrAdd(key uint64) bool {
	if v.m != nil {
		if _, ok := v.m[key]; ok {
			return true
		}
		v.m[key] = struct{}{}
		return false
	}
	for i := 0; i < v.smallLen; i++ {
		if v.small[i] == key {
			return true
		}
	}
	if v.smallLen < len(v.small) {
		v.small[v.smallLen] = key
		v.smallLen++
		return false
	}
	// Promote to map on demand.
	v.m = make(map[uint64]struct{}, 512)
	for i := 0; i < v.smallLen; i++ {
		v.m[v.small[i]] = struct{}{}
	}
	v.m[key] = struct{}{}
	return false
}

func matchTokens(tokens []token, target string) bool {
	stack := make([]state, 0, 16)
	stack = append(stack, state{pi: 0, ti: 0})
	var seen visitedSet

	for len(stack) > 0 {
		s := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		key := (uint64(uint32(s.pi)) << 32) | uint64(uint32(s.ti))
		if seen.seenOrAdd(key) {
			continue
		}

		pi, ti := s.pi, s.ti
		for {
			if pi == len(tokens) {
				if ti == len(target) {
					return true
				}
				break
			}
			tok := tokens[pi]
			switch tok.kind {
			case tokLiteral:
				lit := tok.lit
				if lit == "/" {
					// Special-case: allow trailing "/**" to match empty.
					if ti == len(target) {
						if pi+1 < len(tokens) && tokens[pi+1].kind == tokDoubleStar && pi+2 == len(tokens) {
							pi += 2
							continue
						}
						goto nextState
					}
					if target[ti] != '/' {
						goto nextState
					}
					ti++
					pi++
					continue
				}
				if len(target)-ti < len(lit) || target[ti:ti+len(lit)] != lit {
					goto nextState
				}
				ti += len(lit)
				pi++
			case tokQuestion:
				if ti >= len(target) {
					goto nextState
				}
				r, size := utf8.DecodeRuneInString(target[ti:])
				if r == '/' {
					goto nextState
				}
				if r == utf8.RuneError && size == 0 {
					goto nextState
				}
				if size <= 0 {
					size = 1
				}
				ti += size
				pi++
			case tokStar:
				// Branch: match zero runes, or consume one rune (but never '/').
				stack = append(stack, state{pi: pi + 1, ti: ti})
				if ti >= len(target) {
					goto nextState
				}
				r, size := utf8.DecodeRuneInString(target[ti:])
				if r == '/' {
					goto nextState
				}
				if size <= 0 {
					size = 1
				}
				ti += size
				// stay on same token
			case tokDoubleStar:
				// ** matches zero or more *path segments*.
				// Epsilon: match zero segments.
				stack = append(stack, state{pi: pi + 1, ti: ti})
				// If followed by '/', allow skipping it when matching zero segments.
				if pi+1 < len(tokens) && tokens[pi+1].kind == tokLiteral && tokens[pi+1].lit == "/" {
					stack = append(stack, state{pi: pi + 2, ti: ti})
				}
				if ti >= len(target) {
					goto nextState
				}
				// Consume exactly one segment (possibly empty), staying on **.
				if ti > 0 && target[ti-1] != '/' {
					goto nextState
				}
				nextTi := advanceOneSegment(target, ti)
				if nextTi <= ti {
					goto nextState
				}
				ti = nextTi
				// stay on same token
			case tokGroup:
				if len(tok.alts) == 0 {
					pi++
					continue
				}
				matchedAny := false
				for idx := len(tok.alts) - 1; idx >= 0; idx-- {
					alt := tok.alts[idx]
					if len(target)-ti < len(alt) || target[ti:ti+len(alt)] != alt {
						continue
					}
					matchedAny = true
					stack = append(stack, state{pi: pi + 1, ti: ti + len(alt)})
				}
				if !matchedAny {
					goto nextState
				}
				goto nextState
			default:
				goto nextState
			}
		}

	nextState:
		continue
	}

	return false
}

func advanceOneSegment(s string, ti int) int {
	// A segment is the substring between '/' separators. Consume one segment
	// and its separator if present.
	if ti >= len(s) {
		return ti
	}
	if s[ti] == '/' {
		// Empty segment ("//"). Consuming it moves to the next position.
		return ti + 1
	}
	for i := ti; i < len(s); i++ {
		if s[i] == '/' {
			return i + 1
		}
	}
	return len(s)
}

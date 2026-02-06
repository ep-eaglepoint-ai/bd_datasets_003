package rapid

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"testing"
	"time"
)

const defaultRuns = 10000

type failure struct {
	msg string
}

type drawRecord struct {
	value  any
	shrink func(any) []any
}

type T struct {
	rnd       *rand.Rand
	tb        testing.TB
	draws     []drawRecord
	replay    []any
	replaying bool
	drawIndex int
}

func (t *T) Helper() {
	if t.tb != nil {
		t.tb.Helper()
	}
}

func (t *T) Fatalf(format string, args ...interface{}) {
	panic(failure{msg: fmt.Sprintf(format, args...)})
}

type Generator[V any] struct {
	draw   func(*T) V
	shrink func(V) []V
}

func (g *Generator[V]) Draw(t *T, _ string) V {
	if t.replaying {
		if t.drawIndex >= len(t.replay) {
			panic(failure{msg: "replay exceeded recorded draws"})
		}
		val := t.replay[t.drawIndex].(V)
		t.drawIndex++
		return val
	}
	val := g.draw(t)
	var shrinker func(any) []any
	if g.shrink != nil {
		shrinker = func(v any) []any {
			vals := g.shrink(v.(V))
			out := make([]any, 0, len(vals))
			for _, item := range vals {
				out = append(out, item)
			}
			return out
		}
	}
	t.draws = append(t.draws, drawRecord{value: val, shrink: shrinker})
	return val
}

func Custom[V any](f func(*T) V) *Generator[V] {
	return &Generator[V]{draw: f}
}

func Check(t *testing.T, prop func(*T)) {
	t.Helper()
	for i := 0; i < defaultRuns; i++ {
		rt := &T{rnd: rand.New(rand.NewSource(time.Now().UnixNano() + int64(i)*7919)), tb: t}
		msg, failed := runProperty(rt, prop, nil)
		if !failed {
			continue
		}
		shrunk := shrinkFailure(rt, prop)
		t.Fatalf("property failed after %d runs: %s\nshrunk: %s", i+1, msg, formatValues(shrunk))
	}
}

type ShrinkResult struct {
	Values []any
	JSON   string
}

func CheckExpectFailure(t *testing.T, prop func(*T)) ShrinkResult {
	t.Helper()
	rt := &T{rnd: rand.New(rand.NewSource(time.Now().UnixNano())), tb: t}
	for i := 0; i < defaultRuns; i++ {
		_, failed := runProperty(rt, prop, nil)
		if !failed {
			continue
		}
		shrunk := shrinkFailure(rt, prop)
		return ShrinkResult{Values: shrunk, JSON: formatValues(shrunk)}
	}
	t.Fatalf("expected property failure but it passed after %d runs", defaultRuns)
	return ShrinkResult{}
}

func runProperty(t *T, prop func(*T), replay []any) (msg string, failed bool) {
	if replay != nil {
		t.replaying = true
		t.replay = replay
		t.drawIndex = 0
	} else {
		t.replaying = false
		t.draws = nil
		t.drawIndex = 0
	}
	defer func() {
		if r := recover(); r != nil {
			switch v := r.(type) {
			case failure:
				msg = v.msg
				failed = true
			default:
				panic(r)
			}
		}
	}()
	prop(t)
	return msg, failed
}

func shrinkFailure(t *T, prop func(*T)) []any {
	values := make([]any, len(t.draws))
	for i, rec := range t.draws {
		values[i] = rec.value
	}
	for i, rec := range t.draws {
		if rec.shrink == nil {
			continue
		}
		candidates := rec.shrink(values[i])
		for _, cand := range candidates {
			trial := make([]any, len(values))
			copy(trial, values)
			trial[i] = cand
			_, failed := runProperty(t, prop, trial)
			if failed {
				values[i] = cand
				break
			}
		}
	}
	return values
}

func formatValues(values []any) string {
	b, err := json.Marshal(values)
	if err != nil {
		return fmt.Sprintf("%v", values)
	}
	return string(b)
}

func Bool() *Generator[bool] {
	return &Generator[bool]{
		draw: func(t *T) bool { return t.rnd.Intn(2) == 0 },
		shrink: func(v bool) []bool {
			if v {
				return []bool{false}
			}
			return nil
		},
	}
}

func Int() *Generator[int] {
	return &Generator[int]{
		draw: func(t *T) int { return t.rnd.Int() },
		shrink: func(v int) []int {
			if v == 0 {
				return nil
			}
			return []int{0}
		},
	}
}

func Int64() *Generator[int64] {
	return &Generator[int64]{
		draw: func(t *T) int64 { return int64(t.rnd.Uint64()) },
		shrink: func(v int64) []int64 {
			if v == 0 {
				return nil
			}
			return []int64{0}
		},
	}
}

func IntRange(min, max int) *Generator[int] {
	return &Generator[int]{
		draw: func(t *T) int {
			if max <= min {
				return min
			}
			return min + t.rnd.Intn(max-min+1)
		},
		shrink: func(v int) []int {
			if v == min {
				return nil
			}
			candidates := []int{min}
			if min <= 0 && max >= 0 && v != 0 {
				candidates = append(candidates, 0)
			}
			return candidates
		},
	}
}

func Float64() *Generator[float64] {
	return &Generator[float64]{
		draw: func(t *T) float64 { return (t.rnd.Float64()*2 - 1) * math.MaxFloat64 },
		shrink: func(v float64) []float64 {
			if v == 0 || math.IsNaN(v) {
				return []float64{0}
			}
			return []float64{0}
		},
	}
}

func Float64Range(min, max float64) *Generator[float64] {
	return &Generator[float64]{
		draw: func(t *T) float64 {
			if max <= min {
				return min
			}
			return min + t.rnd.Float64()*(max-min)
		},
		shrink: func(v float64) []float64 {
			if v == min {
				return nil
			}
			candidates := []float64{min}
			if min <= 0 && max >= 0 && v != 0 {
				candidates = append(candidates, 0)
			}
			return candidates
		},
	}
}

var letters = []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

func String() *Generator[string] {
	return &Generator[string]{
		draw: func(t *T) string {
			n := t.rnd.Intn(16)
			r := make([]rune, n)
			for i := 0; i < n; i++ {
				r[i] = letters[t.rnd.Intn(len(letters))]
			}
			return string(r)
		},
		shrink: shrinkString,
	}
}

func StringN(min, max, _ int) *Generator[string] {
	return &Generator[string]{
		draw: func(t *T) string {
			n := min
			if max > min {
				n = min + t.rnd.Intn(max-min+1)
			}
			r := make([]rune, n)
			for i := 0; i < n; i++ {
				r[i] = letters[t.rnd.Intn(len(letters))]
			}
			return string(r)
		},
		shrink: func(v string) []string {
			if min == 0 {
				return shrinkString(v)
			}
			r := []rune(v)
			if len(r) <= min {
				return nil
			}
			return []string{string(r[:min])}
		},
	}
}

func SampledFrom[V any](vals []V) *Generator[V] {
	if len(vals) == 0 {
		panic("SampledFrom: empty slice")
	}
	return &Generator[V]{
		draw: func(t *T) V { return vals[t.rnd.Intn(len(vals))] },
		shrink: func(v V) []V {
			if len(vals) == 0 || any(vals[0]) == any(v) {
				return nil
			}
			return []V{vals[0]}
		},
	}
}

func shrinkString(v string) []string {
	r := []rune(v)
	if len(r) == 0 {
		return nil
	}
	if len(r) == 1 {
		return []string{""}
	}
	half := len(r) / 2
	return []string{"", string(r[:half])}
}

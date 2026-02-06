package tests

import (
"time"

"windowagg"
)

type emitted struct {
	key         string
	windowStart int64
	windowEnd   int64
	sum         float64
}

func newAggForTest(windowSizeSec, allowedLatenessSec int64) (*windowagg.WindowedAggregator, <-chan emitted) {
	ch := make(chan emitted, 1024)
	agg := windowagg.NewWindowedAggregator(
		time.Duration(windowSizeSec)*time.Second,
		time.Duration(allowedLatenessSec)*time.Second,
		func(key string, ws int64, we int64, sum float64) {
			ch <- emitted{key: key, windowStart: ws, windowEnd: we, sum: sum}
		},
	)
	return agg, ch
}

func drain(ch <-chan emitted) []emitted {
	var out []emitted
	for {
		select {
		case e := <-ch:
			out = append(out, e)
		default:
			return out
		}
	}
}

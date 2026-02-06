//go:build !after

package tests

import (
	gc_optimization "gc-optimization/repository_before"
	"io"
)

func init() {
	Impl = SerializerImpl{
		SerializeBidResponse: func(w io.Writer, b any) error {
			return gc_optimization.SerializeBidResponse(w, b.(*gc_optimization.BidResponse))
		},
		BidResponse: func(id, markup string, price float64) any {
			return &gc_optimization.BidResponse{ID: id, AdMarkup: markup, Price: price}
		},
	}
}

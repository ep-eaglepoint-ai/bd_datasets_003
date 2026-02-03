package tests

import "io"

type SerializerImpl struct {
	SerializeBidResponse func(io.Writer, any) error
	BidResponse          func(id, markup string, price float64) any
}

var Impl SerializerImpl

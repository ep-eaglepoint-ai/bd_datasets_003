package consistenthash

import (
	"hash/crc32"
)

// Hasher is the interface used to hash keys to uint32 values on the ring.
type Hasher interface {
	Hash(data []byte) uint32
}

// CRC32Hasher implements Hasher using the IEEE polynomial.
type CRC32Hasher struct{}

func (h CRC32Hasher) Hash(data []byte) uint32 {
	return crc32.ChecksumIEEE(data)
}

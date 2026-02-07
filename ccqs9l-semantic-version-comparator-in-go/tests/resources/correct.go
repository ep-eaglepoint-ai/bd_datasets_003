package main

import (
	"strconv"
	"strings"
)

func Compare(a, b string) int {
	clean := func(s string) []int {
		if i := strings.Index(s, "-"); i >= 0 {
			s = s[:i]
		}
		parts := strings.Split(s, ".")
		res := make([]int, 3)
		for i := 0; i < len(parts) && i < 3; i++ {
			res[i], _ = strconv.Atoi(parts[i])
		}
		return res
	}

	x, y := clean(a), clean(b)
	for i := 0; i < 3; i++ {
		if x[i] < y[i] {
			return -1
		}
		if x[i] > y[i] {
			return 1
		}
	}
	return 0
}

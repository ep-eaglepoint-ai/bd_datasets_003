package main

import (
	"adain-go/adain"
	"fmt"
	"math/rand"
	"time"
)

func main() {
	rand.Seed(time.Now().UnixNano())
	N, C, H, W := 2, 3, 4, 4
	content := adain.Z([]int{N, C, H, W})
	style := adain.Z([]int{1, C, H, W})

	for i := range content.D {
		content.D[i] = rand.Float64()
	}
	for i := range style.D {
		style.D[i] = rand.Float64()
	}

	output, err := adain.R(content, style, 0.8, 1e-6, nil, nil)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	fmt.Println("Output shape:", output.S)
	fmt.Println("First 10 values:", output.D[:10])
}

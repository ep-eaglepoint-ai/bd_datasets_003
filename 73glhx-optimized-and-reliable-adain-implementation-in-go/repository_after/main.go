package main

import (
	"fmt"
	"math/rand"
	"time"

	"adain-go/adain" // import your optimized adain package
)

func main() {
	rand.Seed(time.Now().UnixNano())

	// Define dimensions
	N, C, H, W := 2, 3, 4, 4

	// Initialize content and style tensors
	content := adain.NewTensor([]int{N, C, H, W})
	style := adain.NewTensor([]int{1, C, H, W})

	// Fill with random values
	for i := range content.Data {
		content.Data[i] = rand.Float64()
	}
	for i := range style.Data {
		style.Data[i] = rand.Float64()
	}

	// Alpha blending 0.8, epsilon 1e-6, no masks
	output, err := adain.ApplyAdaIN(content, style, 0.8, 1e-6, nil, nil)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// Print output summary
	fmt.Println("Output shape:", output.Shape)
	fmt.Println("First 10 values:", output.Data[:10])
}

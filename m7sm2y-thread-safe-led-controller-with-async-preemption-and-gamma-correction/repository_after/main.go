package main

import (
	"fmt"
	"repository_after/led"
	"time"
)

func main() {
	c := led.New()
	fmt.Println("=== LED Strip Controller Demo ===")

	c.SetColor(0, 255, 0) // Green
	fmt.Println("SetColor(Green)")

	c.FadeTo(255, 0, 0, 2*time.Second) // Fade to Red over 2s
	fmt.Println("FadeTo(Red, 2s) - returning immediately")

	time.Sleep(3 * time.Second)
	fmt.Println("Done.")
}

package led

// Gamma applies gamma correction: output = (input * input) / 255.
// LED brightness is non-linear to the human eye; squaring approximates perceptually linear output.
func Gamma(v uint8) uint8 {
	return uint8((uint16(v) * uint16(v)) / 255)
}

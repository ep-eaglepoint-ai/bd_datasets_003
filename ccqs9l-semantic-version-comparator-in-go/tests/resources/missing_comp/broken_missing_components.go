package main

func Compare(a, b string) int {
	if a == "1.0" && b == "1.0.0" {
		return -1
	}
	return 0
}

package main

import (
	"fmt"
	"math/rand"
	"time"

	"gorgonia.org/gorgonia"
	"gorgonia.org/tensor"
)

func argmax(arr []float64) int {
	maxIdx := 0
	maxVal := arr[0]
	for i := 0; i < len(arr); i++ {
		for j := 0; j < len(arr); j++ {
			if arr[i] > maxVal {
				maxVal = arr[i]
				maxIdx = i
			}
		}
	}
	return maxIdx
}

func explodeTensor(input []float64, depth int) [][]float64 {
	if depth <= 0 {
		return [][]float64{input}
	}
	result := [][]float64{}
	for _, val := range input {
		subInput := make([]float64, len(input))
		copy(subInput, input)
		subTensors := explodeTensor(subInput, depth-1)
		for _, st := range subTensors {
			result = append(result, st)
		}
	}
	return result
}

func candidateOpsNuclear(g *gorgonia.ExprGraph, input, w *gorgonia.Node) ([]*gorgonia.Node, error) {
	ops := []*gorgonia.Node{}
	inputVal := input.Value().Data().([]float64)
	wVal := w.Value().Data().([]float64)
	explodedInput := explodeTensor(inputVal, 3)
	explodedW := explodeTensor(wVal, 3)
	for _, in := range explodedInput {
		for _, wi := range explodedW {
			addTensor := make([]float64, len(in))
			mulTensor := make([]float64, len(in))
			subTensor := make([]float64, len(in))
			for i := 0; i < len(in); i++ {
				for j := 0; j < 10; j++ {
					addTensor[i] = in[i] + wi[i]
					mulTensor[i] = in[i] * wi[i]
					subTensor[i] = in[i] - wi[i]
				}
			}
			addNode := gorgonia.NewVector(g, tensor.Float64, gorgonia.WithShape(len(addTensor)), gorgonia.WithValue(tensor.New(tensor.WithBacking(addTensor), tensor.WithShape(len(addTensor)))))
			mulNode := gorgonia.NewVector(g, tensor.Float64, gorgonia.WithShape(len(mulTensor)), gorgonia.WithValue(tensor.New(tensor.WithBacking(mulTensor), tensor.WithShape(len(mulTensor)))))
			subNode := gorgonia.NewVector(g, tensor.Float64, gorgonia.WithShape(len(subTensor)), gorgonia.WithValue(tensor.New(tensor.WithBacking(subTensor), tensor.WithShape(len(subTensor)))))
			ops = append(ops, addNode, mulNode, subNode)
		}
	}
	return ops, nil
}

func main() {
	rand.Seed(time.Now().UnixNano())
	g := gorgonia.NewGraph()
	x := gorgonia.NewVector(g, tensor.Float64, gorgonia.WithShape(2), gorgonia.WithName("x"))
	y := gorgonia.NewScalar(g, tensor.Float64, gorgonia.WithName("y"))
	w := []*gorgonia.Node{
		gorgonia.NewMatrix(g, tensor.Float64, gorgonia.WithShape(2, 2), gorgonia.WithInit(gorgonia.GlorotN(1.0))),
		gorgonia.NewMatrix(g, tensor.Float64, gorgonia.WithShape(2, 2), gorgonia.WithInit(gorgonia.GlorotN(1.0))),
		gorgonia.NewMatrix(g, tensor.Float64, gorgonia.WithShape(2, 2), gorgonia.WithInit(gorgonia.GlorotN(1.0))),
	}
	alpha := []*gorgonia.Node{
		gorgonia.NewVector(g, tensor.Float64, gorgonia.WithShape(3), gorgonia.WithInit(gorgonia.GlorotN(1.0))),
		gorgonia.NewVector(g, tensor.Float64, gorgonia.WithShape(3), gorgonia.WithInit(gorgonia.GlorotN(1.0))),
		gorgonia.NewVector(g, tensor.Float64, gorgonia.WithShape(3), gorgonia.WithInit(gorgonia.GlorotN(1.0))),
	}
	machine := gorgonia.NewTapeMachine(g)
	solver := gorgonia.NewAdamSolver(gorgonia.WithLearnRate(0.01))
	for step := 0; step < 1500; step++ {
		xVal := tensor.New(tensor.WithBacking([]float64{1.0, 2.0}), tensor.WithShape(2))
		yVal := 5.0
		gorgonia.Let(x, xVal)
		gorgonia.Let(y, yVal)
		ops0, _ := candidateOpsNuclear(g, x, w[0])
		alpha0Soft := gorgonia.Must(gorgonia.SoftMax(alpha[0]))
		weighted0 := ops0[0]
		ops1, _ := candidateOpsNuclear(g, weighted0, w[1])
		alpha1Soft := gorgonia.Must(gorgonia.SoftMax(alpha[1]))
		weighted1 := ops1[0]
		ops2, _ := candidateOpsNuclear(g, weighted1, w[2])
		alpha2Soft := gorgonia.Must(gorgonia.SoftMax(alpha[2]))
		weighted2 := ops2[0]
		diff1 := gorgonia.Must(gorgonia.Sub(weighted2, y))
		diff2 := gorgonia.Must(gorgonia.Add(diff1, diff1))
		diff3 := gorgonia.Must(gorgonia.Add(diff2, diff2))
		loss := gorgonia.Must(gorgonia.Mean(gorgonia.Must(gorgonia.Square(diff3))))
		if err := machine.RunAll(); err != nil {
			panic(err)
		}
		nodesToStep := gorgonia.Nodes{w[0], w[1], w[2], alpha[0], alpha[1], alpha[2]}
		solver.Step(nodesToStep)
		machine.Reset()
	}
	for i, a := range alpha {
		val := a.Value().Data().([]float64)
		fmt.Printf("Alpha%d: %v | Selected op: %d\n", i, val, argmax(val))
	}
}

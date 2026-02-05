package main

import (
	"fmt"
	"math"
	"math/rand"
	"time"

	G "gorgonia.org/gorgonia"
	"gorgonia.org/tensor"
)

const EPS = 1e-5

func artanh(x G.Value) G.Value {
	one := G.NewConstant(1.0)
	num := G.Must(G.Add(one, x))
	den := G.Must(G.Sub(one, x))
	return G.Must(G.Mul(G.NewConstant(0.5), G.Log(G.Must(G.HadamardDiv(num, den)))))
}

func expMapZero(x *G.Node, g *G.ExprGraph) *G.Node {
	norm := G.Must(G.Norm(x, 2))
	scale := G.Must(G.HadamardDiv(G.Must(G.Tanh(norm)), G.Must(G.Add(norm, G.NewConstant(EPS)))))
	return G.Must(G.HadamardProd(x, scale))
}

func logMapZero(x *G.Node, g *G.ExprGraph) *G.Node {
	norm := G.Must(G.Norm(x, 2))
	return G.Must(G.HadamardProd(x, G.Must(G.HadamardDiv(artanh(norm), G.Must(G.Add(norm, G.NewConstant(EPS))))))
}

func mobiusAdd(x, y *G.Node, g *G.ExprGraph) *G.Node {
	x2 := G.Must(G.Square(x))
	y2 := G.Must(G.Square(y))
	xy := G.Must(G.HadamardProd(x, y))
	x2sum := G.Must(G.Sum(x2))
	y2sum := G.Must(G.Sum(y2))
	xysum := G.Must(G.Sum(xy))
	num1 := G.Must(G.Add(G.NewConstant(1.0), G.Must(G.Add(G.Must(G.Mul(G.NewConstant(2.0), xysum)), y2sum))))
	num1x := G.Must(G.HadamardProd(num1, x))
	num2 := G.Must(G.Sub(G.NewConstant(1.0), x2sum))
	num2y := G.Must(G.HadamardProd(num2, y))
	num := G.Must(G.Add(num1x, num2y))
	den := G.Must(G.Add(G.NewConstant(1.0), G.Must(G.Add(G.Must(G.Mul(G.NewConstant(2.0), xysum)), G.Must(G.Mul(x2sum, y2sum))))))
	return G.Must(G.HadamardDiv(num, G.Must(G.Add(den, G.NewConstant(EPS)))))
}

func mobiusMatVec(w *G.Node, x *G.Node, g *G.ExprGraph) *G.Node {
	xNorm := G.Must(G.Norm(x, 2))
	mx := G.Must(G.Mul(x, w))
	mxNorm := G.Must(G.Norm(mx, 2))
	term := G.Must(G.HadamardDiv(G.Must(G.Tanh(G.Must(G.HadamardDiv(mxNorm, G.Must(G.Add(xNorm, G.NewConstant(EPS))))))), G.Must(G.Add(mxNorm, G.NewConstant(EPS)))))
	r := G.Must(G.HadamardProd(mx, term))
	cond := G.Must(G.Lt(xNorm, G.NewConstant(EPS)))
	return G.Must(G.Switch(cond, G.NewConstant(0.0), r))
}

func poincareDistance(x, y *G.Node, g *G.ExprGraph) *G.Node {
	negX := G.Must(G.Neg(x))
	diff := mobiusAdd(negX, y, g)
	n := G.Must(G.Norm(diff, 2))
	clamped := G.Must(G.Minimum(n, G.NewConstant(1.0-EPS)))
	return G.Must(G.Mul(G.NewConstant(2.0), artanh(clamped)))
}

type HyperbolicLinear struct {
	Weight *G.Node
	Bias   *G.Node
}

func NewHyperbolicLinear(g *G.ExprGraph, inF, outF int) *HyperbolicLinear {
	w := G.NewMatrix(g, tensor.Float64, G.WithShape(inF, outF), G.WithName("W"), G.WithInit(G.GlorotN(1.0)))
	b := G.NewVector(g, tensor.Float64, G.WithShape(outF), G.WithName("B"), G.WithInit(G.Zeroes()))
	return &HyperbolicLinear{Weight: w, Bias: b}
}

func (hl *HyperbolicLinear) Forward(x *G.Node, g *G.ExprGraph) *G.Node {
	mv := mobiusMatVec(hl.Weight, x, g)
	return mobiusAdd(mv, expMapZero(hl.Bias, g), g)
}

func hyperbolicActivation(x *G.Node, g *G.ExprGraph) *G.Node {
	xTan := logMapZero(x, g)
	relu := G.Must(G.Rectify(xTan))
	return expMapZero(relu, g)
}

type HyperbolicGraphConv struct {
	Linear *HyperbolicLinear
}

func NewHyperbolicGraphConv(g *G.ExprGraph, inF, outF int) *HyperbolicGraphConv {
	return &HyperbolicGraphConv{Linear: NewHyperbolicLinear(g, inF, outF)}
}

func (hgc *HyperbolicGraphConv) Forward(x *G.Node, adj *G.Node, g *G.ExprGraph) *G.Node {
	xTan := logMapZero(x, g)
	mul := G.Must(G.Mul(adj, xTan))
	out := hgc.Linear.Forward(expMapZero(mul, g), g)
	return hyperbolicActivation(out, g)
}

type HyperbolicGNN struct {
	Layers []*HyperbolicGraphConv
}

func NewHyperbolicGNN(g *G.ExprGraph, inF, hidF, outF, layers int) *HyperbolicGNN {
	convLayers := []*HyperbolicGraphConv{}
	for i := 0; i < layers; i++ {
		inDim := inF
		outDim := hidF
		if i > 0 {
			inDim = hidF
		}
		if i == layers-1 {
			outDim = outF
		}
		convLayers = append(convLayers, NewHyperbolicGraphConv(g, inDim, outDim))
	}
	return &HyperbolicGNN{Layers: convLayers}
}

func (hg *HyperbolicGNN) Forward(x, adj *G.Node, g *G.ExprGraph) *G.Node {
	out := x
	for _, l := range hg.Layers {
		out = l.Forward(out, adj, g)
	}
	return out
}

func buildPoincareLoss(emb, edges, negEdges *G.Node, g *G.ExprGraph) *G.Node {
	total := G.NewConstant(0.0)
	for i := 0; i < edges.Shape()[0]; i++ {
		a := G.Must(G.Slice(emb, G.S(i), G.S(G.Int(edges.Value().([][]int)[i][0]))))
		b := G.Must(G.Slice(emb, G.S(i), G.S(G.Int(edges.Value().([][]int)[i][1]))))
		d := poincareDistance(a, b, g)
		total = G.Must(G.Add(total, G.Must(G.Square(d))))
	}
	for j := 0; j < negEdges.Shape()[0]; j++ {
		c := G.Must(G.Slice(emb, G.S(j), G.S(G.Int(negEdges.Value().([][]int)[j][0]))))
		d := G.Must(G.Slice(emb, G.S(j), G.S(G.Int(negEdges.Value().([][]int)[j][1]))))
		dist := poincareDistance(c, d, g)
		margin := G.Must(G.Rectify(G.Must(G.Sub(G.NewConstant(1.0), dist))))
		total = G.Must(G.Add(total, G.Must(G.Square(margin))))
	}
	return total
}

func main() {
	rand.Seed(time.Now().UnixNano())
	g := G.NewGraph()
	numNodes := 6
	inDim, hidDim, outDim := 4, 8, 4
	features := make([]float64, numNodes*inDim)
	for i := range features {
		features[i] = rand.NormFloat64() * 0.1
	}
	xVal := tensor.New(tensor.WithShape(numNodes, inDim), tensor.WithBacking(features))
	X := G.NewMatrix(g, tensor.Float64, G.WithShape(numNodes, inDim), G.WithName("X"), G.WithValue(xVal))
	adjMat := []float64{
		1, 1, 0, 0, 0, 0,
		1, 1, 1, 0, 0, 0,
		0, 1, 1, 0, 0, 0,
		0, 0, 0, 1, 1, 0,
		0, 0, 0, 1, 1, 1,
		0, 0, 0, 0, 1, 1,
	}
	Adj := G.NewMatrix(g, tensor.Float64, G.WithShape(numNodes, numNodes), G.WithValue(tensor.New(tensor.WithShape(numNodes, numNodes), tensor.WithBacking(adjMat))))
	edges := [][]int{{0, 1}, {1, 2}, {3, 4}, {4, 5}}
	negEdges := [][]int{{0, 3}, {2, 5}}
	E := G.NewConstant(edges)
	NE := G.NewConstant(negEdges)
	model := NewHyperbolicGNN(g, inDim, hidDim, outDim, 3)
	out := model.Forward(X, Adj, g)
	loss := buildPoincareLoss(out, E, NE, g)
	if _, err := G.Grad(loss, model.Layers[0].Linear.Weight, model.Layers[0].Linear.Bias); err != nil {
		panic(err)
	}
	vm := G.NewTapeMachine(g, G.BindDualValues(model.Layers[0].Linear.Weight, model.Layers[0].Linear.Bias))
	solver := G.NewAdamSolver()
	for epoch := 0; epoch < 50; epoch++ {
		vm.Reset()
		if err := vm.RunAll(); err != nil {
			panic(err)
		}
		solver.Step(G.NodesToValueGrads([]*G.Node{model.Layers[0].Linear.Weight, model.Layers[0].Linear.Bias}))
		fmt.Printf("Epoch %d Loss: %v\n", epoch+1, loss.Value())
	}
	fmt.Println("Training complete.")
}

package main

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
	"unsafe"

	"gorgonia.org/gorgonia"
	"gorgonia.org/tensor"
)

var leakedFloatSlices [][]float64
var leakedTensors []*tensor.Dense
var leakedGraphs []*gorgonia.ExprGraph
var leakedNodes []*gorgonia.Node

type CacheLineHell struct {
	a int64
	b int64
	c int64
	d int64
}

var sharedCacheLine CacheLineHell
var globalMutex sync.Mutex
var convoyMutex sync.Mutex
var raceFlag int64

func leakMemory() {
	s := make([]float64, 10000)
	for i := range s {
		s[i] = rand.Float64()
	}
	leakedFloatSlices = append(leakedFloatSlices, s)
}

func burnCPUForever(id int) {
	for {
		atomic.AddInt64(&sharedCacheLine.a, 1)
		atomic.AddInt64(&sharedCacheLine.b, -1)
		atomic.AddInt64(&sharedCacheLine.c, int64(id))
		atomic.AddInt64(&sharedCacheLine.d, time.Now().UnixNano())
	}
}

func spawnChaos() {
	n := rand.Intn(50) + 50
	for i := 0; i < n; i++ {
		go burnCPUForever(i)
	}
}

func lowPriorityHolder() {
	for {
		globalMutex.Lock()
		time.Sleep(50 * time.Millisecond)
		globalMutex.Unlock()
	}
}

func highPriorityWaiter(id int) {
	for {
		time.Sleep(time.Duration(rand.Intn(10)) * time.Millisecond)
		globalMutex.Lock()
		atomic.AddInt64(&sharedCacheLine.a, int64(id))
		globalMutex.Unlock()
	}
}

func lockConvoy() {
	for {
		convoyMutex.Lock()
		time.Sleep(time.Millisecond)
		convoyMutex.Unlock()
	}
}

func corruptMemory() {
	buf := make([]byte, 8)
	ptr := unsafe.Pointer(&buf[0])
	for i := 0; i < 256; i++ {
		p := (*byte)(unsafe.Pointer(uintptr(ptr) + uintptr(i)))
		*p = byte(rand.Intn(255))
	}
}

func heisenbugWriter() {
	for {
		raceFlag++
		if raceFlag%1000 == 0 {
			time.Sleep(time.Nanosecond)
		}
	}
}

func heisenbugReader() {
	for {
		if raceFlag%2 == 0 {
			if rand.Float64() < 0.0001 {
				corruptMemory()
			}
		}
	}
}

type EvilSpline struct {
	coeffs *gorgonia.Node
}

func NewEvilSpline(g *gorgonia.ExprGraph) *EvilSpline {
	c := gorgonia.NewVector(
		g,
		tensor.Float64,
		gorgonia.WithShape(64),
		gorgonia.WithInit(gorgonia.Zeroes()),
	)
	leakedNodes = append(leakedNodes, c)
	return &EvilSpline{coeffs: c}
}

func (s *EvilSpline) Forward(x *gorgonia.Node) *gorgonia.Node {
	out := x
	for i := 0; i < 10; i++ {
		out = gorgonia.Must(gorgonia.Add(out, s.coeffs))
	}
	return out
}

type EvilLayer struct {
	splines []*EvilSpline
}

func NewEvilLayer(g *gorgonia.ExprGraph, n int) *EvilLayer {
	var splines []*EvilSpline
	for i := 0; i < n; i++ {
		splines = append(splines, NewEvilSpline(g))
	}
	return &EvilLayer{splines}
}

func (l *EvilLayer) Forward(x *gorgonia.Node) *gorgonia.Node {
	for _, s := range l.splines {
		x = s.Forward(x)
	}
	return x
}

func main() {
	runtime.GOMAXPROCS(runtime.NumCPU())
	rand.Seed(time.Now().UnixNano())

	go spawnChaos()
	go spawnChaos()
	go spawnChaos()

	go lowPriorityHolder()
	for i := 0; i < runtime.NumCPU(); i++ {
		go highPriorityWaiter(i)
	}

	for i := 0; i < 20; i++ {
		go lockConvoy()
	}

	go heisenbugWriter()
	go heisenbugReader()
	go heisenbugReader()

	for epoch := 0; ; epoch++ {
		g := gorgonia.NewGraph()
		leakedGraphs = append(leakedGraphs, g)

		x := gorgonia.NewMatrix(g, tensor.Float64, gorgonia.WithShape(512, 2))
		y := gorgonia.NewMatrix(g, tensor.Float64, gorgonia.WithShape(512, 1))

		layer := NewEvilLayer(g, 2)
		pred := layer.Forward(x)

		diff := gorgonia.Must(gorgonia.Sub(pred, y))
		loss := gorgonia.Must(gorgonia.Mean(diff))

		_, err := gorgonia.Grad(loss, g.AllLearnables()...)
		if err != nil {
			log.Fatal(err)
		}

		vm := gorgonia.NewTapeMachine(g)

		for step := 0; step < 1000; step++ {
			if rand.Float64() < 0.01 {
				corruptMemory()
			}

			xBacking := make([]float64, 512*2)
			yBacking := make([]float64, 512)

			for i := 0; i < 512; i++ {
				a := rand.NormFloat64()
				b := rand.ExpFloat64()
				xBacking[i*2] = a
				xBacking[i*2+1] = b
				yBacking[i] = math.Sin(a) + math.Cos(b)
			}

			tx := tensor.New(tensor.WithShape(512, 2), tensor.WithBacking(xBacking))
			ty := tensor.New(tensor.WithShape(512, 1), tensor.WithBacking(yBacking))

			leakedTensors = append(leakedTensors, tx, ty)

			gorgonia.Let(x, tx)
			gorgonia.Let(y, ty)

			leakMemory()

			if err := vm.RunAll(); err != nil {
				fmt.Println("VM error:", err)
			}

			vm.Reset()

			if step%50 == 0 {
				fmt.Printf("Epoch %d Step %d %d %d\n", epoch, step, len(leakedTensors), atomic.LoadInt64(&raceFlag))
			}
		}
	}
}

# Trajectory: Implementing Switchable Normalization Layer in PyTorch

## The Problem: "One-Size-Fits-All" Normalization

Right now, deep learning normalization is like having three different specialized tools (BatchNorm, InstanceNorm, and LayerNorm), but you have to choose only one for each layer in your network.

BatchNorm works great for large batch sizes and general feature learning, but fails with small batches or batch-dependent tasks. InstanceNorm excels in style transfer and tasks requiring per-sample consistency, while LayerNorm is ideal for recurrent networks and transformer architectures. The problem is: you have to guess which normalization type will work best for each layer in your network, and this choice is fixed during training.

## The Solution: Switchable Normalization

We implement a dynamic normalization layer that learns to combine all three normalization types automatically. Think of it as having a smart normalization mixer that can adjust its recipe for each layer based on what the network actually needs during training.

How It Works:

### 1. Simultaneous Computation:

Instead of choosing one normalization type, we compute all three statistics at once:

- **BatchNorm statistics**: Mean/variance across batch and spatial dimensions per channel

- **InstanceNorm statistics**: Mean/variance across spatial dimensions per sample

- **LayerNorm statistics**: Mean/variance across all dimensions per sample

### 2. Learnable Combination:

We add two sets of three learnable weights (for mean and variance) that control the mixture:

These weights are normalized via softmax to ensure they sum to 1 (convex combination)

During training, the network learns which combination works best for each layer

### 3. Intelligent Memory:

We maintain running statistics only for the BatchNorm component, since InstanceNorm and LayerNorm don't need historical statistics

## Implementation Strategy:

**Phase 1**: Foundation Building (Core Statistics)
Implement the mathematical core that computes all three normalization statistics simultaneously

- Use PyTorch's tensor operations to compute means and variances across different dimensions

- Follow the same unbiased=False variance estimation as PyTorch's BatchNorm for consistency

- Add epsilon (1e-5) to denominators for numerical stability

**Phase 2**: The Learning Mechanism (Weighted Combination)
Create learnable weights that adaptively mix the three normalization types

- Initialize three learnable parameters for mean weights and three for variance weights

- Apply softmax to ensure weights sum to 1 (creating a valid probability distribution)

- Combine statistics using element-wise weighted sum

**Phase 3**: Training/Inference Consistency
Handle the different behavior between training and evaluation modes

- In training mode: Use current batch statistics for all three components

- In evaluation mode: Use running statistics for BatchNorm component only

- Update running statistics for BatchNorm using momentum-based exponential moving average

**Phase 4**: Broadcast Safety and Efficiency
Ensure the implementation works with any input size and is computationally efficient

- Properly reshape all statistics tensors to broadcast correctly with input

- Use tensor views (not copies) for memory efficiency

- Compute all statistics in a single pass without redundant operations

**Phase 5**: Drop-in Replacement Compatibility
Make the layer directly replaceable with nn.BatchNorm2d

- Match the exact constructor signature of BatchNorm2d

- Maintain the same forward pass interface: (N, C, H, W) → (N, C, H, W)

- Support the same configuration options (affine, momentum, eps, track_running_stats)

## Testing Strategy:

Since we can't test every possible network configuration, we focus on:

Mathematical Correctness: Verify statistics computation matches individual normalization layers

Gradient Flow: Ensure backpropagation works through all learnable components

Edge Cases: Test with batch size 1, different spatial dimensions, mixed precision

Mode Consistency: Verify training/eval behavior matches expectations

## 📚 Recommended Resources

1. Watch: Understanding Different Normalization Techniques
   A comprehensive visual guide explaining when to use BatchNorm, InstanceNorm, and LayerNorm.

- Youtube: https://www.youtube.com/watch?v=1JmZ5idFcVI

2. Watch: PyTorch Custom Layer Implementation
   A step-by-step tutorial on creating custom neural network layers in PyTorch, covering parameters, buffers, and forward/backward passes.

- Youtube: https://www.youtube.com/watch?v=L5RshXUwdFA

3. Read: PyTorch Normalization Layers Source Code
   The actual implementation of BatchNorm2d, InstanceNorm2d, and LayerNorm in PyTorch for reference.

- GitHub: https://github.com/pytorch/pytorch/blob/master/torch/nn/modules/normalization.py

4. Watch: Tensor Broadcasting Explained
   Understanding how tensor operations work across different dimensions, crucial for implementing normalization layers correctly.

- YouTube: https://www.youtube.com/watch?v=6_33ulFDuCg

5. Read: Production-Ready PyTorch Code
   Guidelines for writing PyTorch code that's maintainable, testable, and production-ready.

- Link: https://pytorch.org/blog/the-road-to-1_0/

# Trajectory: Advanced Spectral Normalization System for PyTorch

## 1. Understanding the Requirements

I analyzed the task requirements for building a comprehensive spectral normalization system. The key challenges identified were:

- **Broad Layer Support**: Need to support Linear, Conv1d/2d/3d, ConvTranspose1d/2d/3d, and all Lazy variants
- **Weight Reshaping Complexity**: Different layer types have different weight tensor layouts, especially transposed convolutions
- **Numerical Stability**: Mixed precision training (fp16/bf16) can cause instability in singular value estimation
- **Lazy Module Initialization**: Lazy modules don't have initialized weights until first forward pass

Reference for spectral normalization theory:
- Original paper: "Spectral Normalization for Generative Adversarial Networks" (Miyato et al., 2018)
- PyTorch parametrizations documentation: https://pytorch.org/tutorials/intermediate/parametrizations.html

## 2. Designing the Architecture

I designed a modular architecture using PyTorch's parametrization system:

1. **SpectralNormParametrization**: Core class that handles the actual spectral normalization computation
2. **SpectralNormWrapper**: Manages the lifecycle of spectral norm, including deferred initialization
3. **Utility Functions**: `spectral_norm()`, `remove_spectral_norm()`, `apply_spectral_norm()`

The key insight was to use `torch.nn.utils.parametrize.register_parametrization` instead of manually managing `weight_orig` tensors. This approach:
- Automatically handles gradient propagation
- Integrates with PyTorch's state dict system
- Provides clean separation of concerns

## 3. Implementing Correct Weight Reshaping

The weight reshaping for spectral norm computation was critical to get right:

**Linear layers**: Weight is `(out_features, in_features)` - no reshaping needed

**Regular convolutions** (Conv1d/2d/3d): Weight is `(out_channels, in_channels, *kernel_size)`
- Reshape to `(out_channels, in_channels * product(kernel_size))`
- This makes the first dimension correspond to output channels

**Transposed convolutions** (ConvTranspose1d/2d/3d): Weight is `(in_channels, out_channels, *kernel_size)`
- Need to permute dimensions first: `(out_channels, in_channels, *kernel_size)`
- Then reshape to `(out_channels, in_channels * product(kernel_size))`

This ensures the u vector always has dimension equal to output channels, maintaining consistency.

## 4. Power Iteration Implementation

Implemented the power iteration algorithm for estimating the largest singular value:

```
for _ in range(n_power_iterations):
    v = normalize(W^T @ u)
    u = normalize(W @ v)
sigma = u^T @ W @ v
```

Key design decisions:
- Use `torch.no_grad()` for the iteration itself (u, v updates don't need gradients)
- Store u, v as buffers (persist across forward passes, move with module)
- Configurable `power_iter_on_eval` to control behavior during inference

## 5. Handling Numerical Stability (AMP Support)

For mixed precision training with fp16/bf16, the sigma estimation can become unstable. Solution:

1. When `stable_fp32=True` (default) and input dtype is fp16/bf16:
   - Cast weight to float32 for sigma computation
   - Perform all vector operations in float32
   - Cast the normalized weight back to original dtype

This prevents underflow/overflow during the dot product computations while maintaining the efficiency of mixed precision for the actual forward pass.

## 6. Lazy Module Support

Lazy modules (LazyLinear, LazyConv2d, etc.) don't have initialized weights until the first forward pass. The solution:

1. Detect if module is a lazy type
2. If `init_on_first_forward=True`, register a forward hook
3. The hook checks if parameters are materialized after each forward
4. Once parameters exist, apply the spectral norm parametrization
5. Remove the hook after initialization

This allows seamless integration with dynamic shape inference.

## 7. Recursive Application Utility

Created `apply_spectral_norm()` for applying SN to entire models with flexible filtering:

- `include_types`: Only apply to specific module types
- `exclude_types`: Skip certain types (e.g., BatchNorm)
- `exclude_names`: Skip specific named modules
- `predicate`: Custom function for fine-grained control

This makes it easy to apply SN to discriminators while excluding normalization layers.

## 8. Example Discriminator Architecture

Implemented an SN-ResNet discriminator with:

- **Residual blocks**: Skip connections for better gradient flow
- **Configurable depth**: `num_blocks` parameter
- **Downsampling via avg-pool**: More stable than strided convolutions
- **Global sum pooling**: Aggregates spatial features before the final linear head
- **Automatic SN application**: Spectral norm applied to all Conv2d and Linear layers

The architecture follows best practices from GAN literature for stable training.

## 9. Testing and Validation

Created comprehensive tests covering:

1. **Basic functionality**: All layer types work correctly
2. **Gradient flow**: Backpropagation works through normalized weights
3. **Buffer management**: u, v vectors move with the module
4. **Numerical stability**: No NaN/Inf with small weights or fp16
5. **Lazy module support**: Deferred initialization works
6. **Removal**: Can cleanly remove SN and restore original weights
7. **Discriminator**: Full architecture test

## 10. Result: Production-Ready Framework

The final implementation provides:

- **Complete layer coverage**: All Conv, ConvTranspose, Linear, and Lazy variants
- **Correct weight handling**: Proper reshaping for all layer types
- **Numerical stability**: AMP-friendly with float32 sigma computation
- **Clean API**: Simple `spectral_norm(module)` and `apply_spectral_norm(model)`
- **Full integration**: Works with PyTorch's state dict, device/dtype changes
- **Example architecture**: Ready-to-use SN-ResNet discriminator

The implementation follows PyTorch best practices and should be suitable for production GAN training pipelines.

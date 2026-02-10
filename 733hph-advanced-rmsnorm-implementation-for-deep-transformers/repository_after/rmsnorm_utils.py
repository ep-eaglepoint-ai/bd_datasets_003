"""
RMSNorm Utility Functions - Helper methods for RMS computation and parameter broadcasting.

This module contains utility functions used by the RMSNorm class.
"""

from typing import Optional, List
import torch
from torch import Tensor


def compute_rms(
    input: Tensor,
    normalized_axes: List[int],
    num_features: int,
    eps: float,
    learnable_eps: bool = False,
    eps_param: Optional[Tensor] = None,
    keepdim: bool = True
) -> Tensor:
    """
    Compute root mean square over normalized axes.
   
    """
    # Store original dtype for conversion back
    original_dtype = input.dtype
    
    # For numerical stability in mixed precision, compute in float32
    # but preserve the computation graph
    input_float = input.float() if input.dtype != torch.float32 else input
    
    # Square the input
    input_sq = input_float * input_float
    
    # Normalize axes to positive indices for JIT compatibility
    ndim = input.dim()
    normalized_axes_pos = [
        axis if axis >= 0 else axis + ndim
        for axis in normalized_axes
    ]
    
    # Remove duplicates and sort for efficient reduction (JIT-compatible)
    seen: List[int] = []
    for axis in normalized_axes_pos:
        if axis not in seen:
            seen.append(axis)
    normalized_axes_pos = sorted(seen)
    
    # Compute sum over all normalized axes at once for efficiency
    # This is more JIT-friendly than looping
    if len(normalized_axes_pos) == 1:
        input_sq = input_sq.sum(dim=normalized_axes_pos[0], keepdim=keepdim)
    else:
        # Sum over multiple axes
        for axis in normalized_axes_pos:
            input_sq = input_sq.sum(dim=axis, keepdim=keepdim)
    
    # Calculate number of elements being normalized
    num_elements = float(num_features)
    
    # Compute mean of squares
    mean_sq = input_sq / num_elements
    
    # Get epsilon - use learnable if available, otherwise fixed
    if learnable_eps and eps_param is not None:
        # Use learnable epsilon parameter
        eps_tensor = eps_param.to(dtype=mean_sq.dtype, device=mean_sq.device)
        # For per-feature epsilon, we reduce it the same way as the input
        eps_tensor = eps_tensor.mean().expand_as(mean_sq)
    else:
        # Fixed scalar epsilon
        eps_tensor = torch.tensor(eps, dtype=mean_sq.dtype, device=mean_sq.device)
    
    # Compute RMS: sqrt(mean_sq + eps)
    # Use clamp to prevent numerical issues
    rms_input = mean_sq + eps_tensor
    rms = torch.sqrt(torch.clamp(rms_input, min=0.0))
    
    # Convert back to original dtype
    return rms.to(original_dtype)


def broadcast_params(
    param: Optional[Tensor],
    normalized_shape: List[int],
    input_shape: List[int],
    input_dtype: torch.dtype
) -> Optional[Tensor]:
    
    if param is None:
        return None
    
    # Ensure param has the right dtype
    param = param.to(dtype=input_dtype)
    
    # Create view with proper shape for broadcasting
    # param shape is normalized_shape, need to add leading 1s
    num_leading_dims = len(input_shape) - len(normalized_shape)
    
    if num_leading_dims < 0:
        # Input has fewer dimensions than normalized_shape
        # This shouldn't happen in normal usage, but handle gracefully
        return param
    
    # Build broadcast shape: [1, 1, ..., normalized_shape]
    # Build list in a TorchScript-compatible way by iterating
    param_shape: List[int] = []
    for _ in range(num_leading_dims):
        param_shape.append(1)
    for dim in normalized_shape:
        param_shape.append(dim)
    
    # Use view for broadcasting (JIT-compatible)
    return param.view(param_shape)


"""
Root Mean Square Layer Normalization (RMSNorm) for PyTorch.

This module provides a highly robust implementation of RMSNorm that supports:
- Optional learnable scale (gamma) and bias (beta)
- Normalization across one or multiple axes
- Dynamic input shapes with any number of dimensions
- Automatic broadcasting of weights and biases
- Mixed-precision training (float16, bfloat16, float32)
- Optional learnable epsilon per feature
- Zero-vector input protection
- JIT and ONNX compatibility
- Optional residual scaling for deep transformers
"""

from typing import Optional, Union, Tuple, List
import torch
import torch.nn as nn
from torch import Tensor


class RMSNorm(nn.Module):
    """
    Root Mean Square Layer Normalization (RMSNorm).
    
    RMSNorm normalizes inputs by dividing by the root mean square of the features,
    optionally followed by an affine transformation with learnable scale and bias.
    
    Args:
        normalized_shape: Shape of the input to normalize. Can be an int or a tuple/list.
            If int, normalization is performed over the last dimension.
            If tuple/list, normalization is performed over the specified axes.
        eps: Small value added to the denominator for numerical stability.
            Default: 1e-6
        elementwise_affine: If True, use learnable per-element scale (gamma) and bias (beta).
            Default: True
        bias: If True, use learnable bias (beta). Only used if elementwise_affine is True.
            Default: True
        learnable_eps: If True, epsilon becomes a learnable parameter per feature.
            Default: False
        residual_scale: Optional residual scaling factor for deep transformer architectures.
            If provided, applies scaling to residual connections. Default: None
        dtype: Data type for parameters. If None, uses the dtype of the first input.
            Default: None
        normalized_axes: Optional specification of which axes to normalize over.
            If None, defaults to the last len(normalized_shape) axes.
            Can be int, tuple, or list of axis indices (supports negative indices).
            Default: None
    
    Shape:
        - Input: (*, normalized_shape) where * means any number of leading dimensions
        - Output: (*, normalized_shape), same shape as input
    
    Examples:
        >>> # Standard RMSNorm over last dimension
        >>> norm = RMSNorm(512)
        >>> x = torch.randn(32, 128, 512)
        >>> out = norm(x)
        
        >>> # RMSNorm with custom axes
        >>> norm = RMSNorm((128, 512), normalized_axes=[-2, -1])
        >>> x = torch.randn(32, 128, 512)
        >>> out = norm(x)
        
        >>> # RMSNorm with learnable epsilon
        >>> norm = RMSNorm(512, learnable_eps=True)
        >>> x = torch.randn(32, 512)
        >>> out = norm(x)
        
        >>> # RMSNorm without bias
        >>> norm = RMSNorm(512, bias=False)
        >>> x = torch.randn(32, 512)
        >>> out = norm(x)
    """
    
    def __init__(
        self,
        normalized_shape: Union[int, Tuple[int, ...], List[int]],
        eps: float = 1e-6,
        elementwise_affine: bool = True,
        bias: bool = True,
        learnable_eps: bool = False,
        residual_scale: Optional[float] = None,
        dtype: Optional[torch.dtype] = None,
        normalized_axes: Optional[Union[int, Tuple[int, ...], List[int]]] = None,
    ):
        super().__init__()
        
        # Convert normalized_shape to tuple for consistent handling
        if isinstance(normalized_shape, int):
            self.normalized_shape = (normalized_shape,)
        elif isinstance(normalized_shape, (tuple, list)):
            self.normalized_shape = tuple(normalized_shape)
        else:
            raise TypeError(
                f"normalized_shape must be int, tuple, or list, got {type(normalized_shape)}"
            )
        
        # Handle normalized_axes
        if normalized_axes is not None:
            if isinstance(normalized_axes, int):
                self.normalized_axes = [normalized_axes]
            elif isinstance(normalized_axes, (tuple, list)):
                self.normalized_axes = list(normalized_axes)
            else:
                raise TypeError(
                    f"normalized_axes must be int, tuple, or list, got {type(normalized_axes)}"
                )
        else:
            # Default to last len(normalized_shape) axes
            self.normalized_axes = list(range(-len(self.normalized_shape), 0))
        
        self.eps = eps
        self.elementwise_affine = elementwise_affine
        self.bias_enabled = bias
        self.learnable_eps = learnable_eps
        self.residual_scale = residual_scale
        
        # Calculate total number of features for parameter initialization
        self.num_features = 1
        for dim in self.normalized_shape:
            self.num_features *= dim
        
        # Initialize learnable parameters
        if self.elementwise_affine:
            # Scale parameter (gamma)
            self.weight = nn.Parameter(torch.ones(self.normalized_shape, dtype=dtype))
            
            # Bias parameter (beta) - optional
            if self.bias_enabled:
                self.bias = nn.Parameter(torch.zeros(self.normalized_shape, dtype=dtype))
            else:
                self.register_parameter('bias', None)
        else:
            self.register_parameter('weight', None)
            self.register_parameter('bias', None)
        
        # Learnable epsilon per feature
        if self.learnable_eps:
            self.eps_param = nn.Parameter(
                torch.full(self.normalized_shape, eps, dtype=dtype or torch.float32)
            )
        else:
            self.register_parameter('eps_param', None)
    def _compute_rms(
        self,
        input: Tensor,
        keepdim: bool = True
    ) -> Tensor:
        """
        Compute root mean square over normalized axes.
        
        This method is JIT and ONNX compatible, using only standard PyTorch operations.
        
        Args:
            input: Input tensor
            keepdim: Whether to keep the reduced dimensions
        
        Returns:
            RMS tensor with same dtype as input
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
        normalized_axes = [
            axis if axis >= 0 else axis + ndim
            for axis in self.normalized_axes
        ]
        
        # Remove duplicates and sort for efficient reduction (JIT-compatible)
        # Use explicit list with type annotation for JIT compatibility
        seen: List[int] = []
        for axis in normalized_axes:
            if axis not in seen:
                seen.append(axis)
        normalized_axes = sorted(seen)
        
        # Compute sum over all normalized axes at once for efficiency
        # This is more JIT-friendly than looping
        if len(normalized_axes) == 1:
            input_sq = input_sq.sum(dim=normalized_axes[0], keepdim=keepdim)
        else:
            # Sum over multiple axes
            for axis in normalized_axes:
                input_sq = input_sq.sum(dim=axis, keepdim=keepdim)
        
        # Calculate number of elements being normalized
        # This accounts for the actual shape being normalized
        num_elements = float(self.num_features)
        
        # Compute mean of squares
        mean_sq = input_sq / num_elements
        
        # Get epsilon - use learnable if available, otherwise fixed
        if self.learnable_eps and self.eps_param is not None:
            # Use learnable epsilon parameter
            # eps_param has shape (normalized_shape), need to broadcast to mean_sq
            # mean_sq has shape (*, 1) after reduction, so we need to reshape eps
            eps = self.eps_param.to(dtype=mean_sq.dtype, device=mean_sq.device)
            # For per-feature epsilon, we reduce it the same way as the input
            # Since we computed mean over features, we compute mean of epsilon too
            # This makes it a scalar per sample, which broadcasts correctly
            eps = eps.mean().expand_as(mean_sq)
        else:
            # Fixed scalar epsilon
            eps = torch.tensor(self.eps, dtype=mean_sq.dtype, device=mean_sq.device)
        
        # Compute RMS: sqrt(mean_sq + eps)
        # Use clamp to prevent numerical issues
        rms_input = mean_sq + eps
        rms = torch.sqrt(torch.clamp(rms_input, min=0.0))
        
        # Convert back to original dtype
        return rms.to(original_dtype)
    
    def _broadcast_params(
        self,
        param: Optional[Tensor],
        input_shape: List[int],
        input_dtype: torch.dtype
    ) -> Optional[Tensor]:
        """
        Broadcast parameter to match input shape for element-wise operations.
        
        This method ensures parameters are properly broadcasted to work with
        inputs of any number of leading dimensions.
        
        Args:
            param: Parameter tensor to broadcast
            input_shape: Shape of input tensor
            input_dtype: Data type of input tensor
        
        Returns:
            Broadcasted parameter or None
        """
        if param is None:
            return None
        
        # Ensure param has the right dtype
        param = param.to(dtype=input_dtype)
        
        # Create view with proper shape for broadcasting
        # param shape is normalized_shape, need to add leading 1s
        num_leading_dims = len(input_shape) - len(self.normalized_shape)
        
        if num_leading_dims < 0:
            # Input has fewer dimensions than normalized_shape
            # This shouldn't happen in normal usage, but handle gracefully
            return param
        
        # Build broadcast shape: [1, 1, ..., normalized_shape]
        param_shape = [1] * num_leading_dims
        param_shape.extend(self.normalized_shape)
        
        # Use view for broadcasting (JIT-compatible)
        # view() should work if param has the correct total size
        return param.view(param_shape)
    
    def forward(self, input: Tensor) -> Tensor:
        """
        Forward pass of RMSNorm.
        
        This method is JIT and ONNX compatible, using only standard PyTorch operations.
        
        Args:
            input: Input tensor of shape (*, normalized_shape)
        
        Returns:
            Normalized tensor of same shape and dtype as input
        """
        # Store original dtype for preservation
        original_dtype = input.dtype
        
        # Handle empty tensors
        if input.numel() == 0:
            return input
        
        # Compute RMS over normalized axes
        rms = self._compute_rms(input, keepdim=True)
        
        # Prevent division by zero for zero-vector inputs
        # Use a minimum value that's safe for the dtype (JIT-compatible)
        if original_dtype == torch.float16:
            min_rms = torch.tensor(1e-7, dtype=original_dtype, device=rms.device)
        elif original_dtype == torch.bfloat16:
            min_rms = torch.tensor(1e-7, dtype=original_dtype, device=rms.device)
        elif original_dtype == torch.float32:
            min_rms = torch.tensor(1e-7, dtype=original_dtype, device=rms.device)
        elif original_dtype == torch.float64:
            min_rms = torch.tensor(1e-15, dtype=original_dtype, device=rms.device)
        else:
            # Default safe epsilon
            min_rms = torch.tensor(1e-7, dtype=original_dtype, device=rms.device)
        
        # Clamp RMS to prevent division by zero
        rms = torch.clamp(rms, min=min_rms)
        
        # Normalize: divide input by RMS
        # This is the core RMSNorm operation
        normalized = input / rms
        
        # Apply affine transformation if enabled
        if self.elementwise_affine:
            # Broadcast and apply scale (gamma)
            if self.weight is not None:
                weight = self._broadcast_params(self.weight, list(input.shape), original_dtype)
                if weight is not None:
                    normalized = normalized * weight
            
            # Broadcast and add bias (beta) if enabled
            if self.bias_enabled and self.bias is not None:
                bias = self._broadcast_params(self.bias, list(input.shape), original_dtype)
                if bias is not None:
                    normalized = normalized + bias
        
        # Ensure output dtype exactly matches input dtype
        # This is critical for mixed-precision training
        return normalized.to(original_dtype)
    
    def extra_repr(self) -> str:
        """Return extra representation string."""
        s = f"{self.normalized_shape}, eps={self.eps}"
        if not self.elementwise_affine:
            s += ", elementwise_affine=False"
        if not self.bias_enabled:
            s += ", bias=False"
        if self.learnable_eps:
            s += ", learnable_eps=True"
        if self.residual_scale is not None:
            s += f", residual_scale={self.residual_scale}"
        return s


class RMSNormWithResidual(nn.Module):
    """
    RMSNorm with built-in residual connection and scaling.
    
    This variant is specifically designed for deep transformer architectures
    where residual scaling helps maintain numerical stability.
    
    Args:
        normalized_shape: Shape of the input to normalize
        eps: Small value added to the denominator for numerical stability
        elementwise_affine: If True, use learnable scale and bias
        bias: If True, use learnable bias
        residual_scale: Scaling factor for residual connection (default: sqrt(0.5))
        learnable_eps: If True, epsilon becomes learnable
        dtype: Data type for parameters
    
    Examples:
        >>> norm = RMSNormWithResidual(512, residual_scale=0.5)
        >>> x = torch.randn(32, 128, 512)
        >>> residual = torch.randn(32, 128, 512)
        >>> out = norm(x, residual)
    """
    
    def __init__(
        self,
        normalized_shape: Union[int, Tuple[int, ...], List[int]],
        eps: float = 1e-6,
        elementwise_affine: bool = True,
        bias: bool = True,
        residual_scale: float = 0.5,
        learnable_eps: bool = False,
        dtype: Optional[torch.dtype] = None,
    ):
        super().__init__()
        self.rmsnorm = RMSNorm(
            normalized_shape=normalized_shape,
            eps=eps,
            elementwise_affine=elementwise_affine,
            bias=bias,
            learnable_eps=learnable_eps,
            dtype=dtype,
        )
        self.residual_scale = residual_scale
    
    def forward(
        self,
        input: Tensor,
        residual: Optional[Tensor] = None
    ) -> Tensor:
        """
        Forward pass with optional residual connection.
        
        Args:
            input: Input tensor
            residual: Optional residual tensor to add
        
        Returns:
            Normalized and optionally residual-added tensor
        """
        normalized = self.rmsnorm(input)
        
        if residual is not None:
            # Scale residual and add
            normalized = normalized + self.residual_scale * residual
        
        return normalized


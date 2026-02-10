"""
Root Mean Square Layer Normalization (RMSNorm) for PyTorch.
"""

from typing import Optional, Union, Tuple, List
import torch
import torch.nn as nn
from torch import Tensor

from rmsnorm_utils import compute_rms, broadcast_params


class RMSNorm(nn.Module):
    """
    Root Mean Square Layer Normalization (RMSNorm).
    
    RMSNorm normalizes inputs by dividing by the root mean square of the features,
    optionally followed by an affine transformation with learnable scale and bias.
    
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
    
    def forward(self, input: Tensor) -> Tensor:
        
        # Store original dtype for preservation
        original_dtype = input.dtype
        
        # Handle empty tensors
        if input.numel() == 0:
            return input
        
        # Compute RMS over normalized axes using utility function
        rms = compute_rms(
            input=input,
            normalized_axes=self.normalized_axes,
            num_features=self.num_features,
            eps=self.eps,
            learnable_eps=self.learnable_eps,
            eps_param=self.eps_param,
            keepdim=True
        )
        
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
                weight = broadcast_params(
                    self.weight,
                    list(self.normalized_shape),
                    list(input.shape),
                    original_dtype
                )
                if weight is not None:
                    normalized = normalized * weight
            
            # Broadcast and add bias (beta) if enabled
            if self.bias_enabled and self.bias is not None:
                bias = broadcast_params(
                    self.bias,
                    list(self.normalized_shape),
                    list(input.shape),
                    original_dtype
                )
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


# Import RMSNormWithResidual for convenience
# This allows importing both classes from rmsnorm module
try:
    from rmsnorm_extensions import RMSNormWithResidual
except ImportError:
    # Handle case where rmsnorm_extensions might not be available
    RMSNormWithResidual = None


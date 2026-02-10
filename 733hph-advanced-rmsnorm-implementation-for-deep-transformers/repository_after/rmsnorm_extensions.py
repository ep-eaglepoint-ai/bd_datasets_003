"""
RMSNorm Extensions - Additional variants and utilities.

This module contains extended variants of RMSNorm for specialized use cases.
"""

from typing import Optional, Union, Tuple, List
import torch
import torch.nn as nn
from torch import Tensor

from rmsnorm import RMSNorm


class RMSNormWithResidual(nn.Module):
    """
    RMSNorm with built-in residual connection and scaling.
    
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
        
        normalized = self.rmsnorm(input)
        
        if residual is not None:
            # Scale residual and add
            normalized = normalized + self.residual_scale * residual
        
        return normalized


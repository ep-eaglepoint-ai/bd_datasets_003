"""
Optimized SwitchableNorm2d implementation.
Fully vectorized, efficient, and PyTorch-idiomatic version.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple


class SwitchableNorm2d(nn.Module):
    """
    Optimized Switchable Normalization Layer for 2D convolutional inputs (NCHW).
    
    Key optimizations:
    - All operations vectorized (no Python loops)
    - Single softmax operation (not double)
    - Implicit broadcasting (no expand/repeat)
    - Proper in-place updates for running stats
    - Minimal tensor allocations
    - Clear, maintainable structure
    """
    
    def __init__(
        self,
        num_features: int,
        eps: float = 1e-5,
        momentum: float = 0.1,
        affine: bool = True,
        track_running_stats: bool = True,
        device=None,
        dtype=None
    ):
        """
        Initialize optimized SwitchableNorm2d.
        
        Args:
            num_features: Number of channels C (from NCHW)
            eps: Added to denominator for numerical stability
            momentum: Momentum for running mean/variance updates
            affine: If True, learnable affine parameters (gamma, beta)
            track_running_stats: If True, track running stats for BatchNorm
            device: Device to place parameters on
            dtype: Data type for parameters
        """
        factory_kwargs = {'device': device, 'dtype': dtype}
        super().__init__()
        
        self.num_features = num_features
        self.eps = eps
        self.momentum = momentum
        self.affine = affine
        self.track_running_stats = track_running_stats
        
        # Learnable importance weights for mean and variance (3 types: BN, IN, LN)
        self.weight_mean = nn.Parameter(torch.ones(3, **factory_kwargs))
        self.weight_var = nn.Parameter(torch.ones(3, **factory_kwargs))
        
        # Affine transformation parameters
        if self.affine:
            self.weight = nn.Parameter(torch.ones(num_features, **factory_kwargs))
            self.bias = nn.Parameter(torch.zeros(num_features, **factory_kwargs))
        else:
            self.register_parameter('weight', None)
            self.register_parameter('bias', None)
        
        # Running statistics for BatchNorm path only
        if self.track_running_stats:
            self.register_buffer('running_mean', torch.zeros(num_features, **factory_kwargs))
            self.register_buffer('running_var', torch.ones(num_features, **factory_kwargs))
            # Handle tensor creation separately to avoid dtype conflict
            if device is not None and dtype is not None:
                self.register_buffer('num_batches_tracked', 
                                    torch.tensor(0, dtype=torch.long, device=device))
            elif device is not None:
                self.register_buffer('num_batches_tracked', 
                                    torch.tensor(0, dtype=torch.long, device=device))
            elif dtype is not None:
                self.register_buffer('num_batches_tracked', 
                                    torch.tensor(0, dtype=torch.long))
            else:
                self.register_buffer('num_batches_tracked', 
                                    torch.tensor(0, dtype=torch.long))
        else:
            self.register_buffer('running_mean', None)
            self.register_buffer('running_var', None)
            self.register_buffer('num_batches_tracked', None)
        
        self.reset_parameters()
    
    def reset_running_stats(self) -> None:
        """Reset running statistics for BatchNorm."""
        if self.track_running_stats:
            self.running_mean.zero_()
            self.running_var.fill_(1)
            self.num_batches_tracked.zero_()
    
    def reset_parameters(self) -> None:
        """Reset all learnable parameters."""
        self.reset_running_stats()
        if self.affine:
            nn.init.ones_(self.weight)
            nn.init.zeros_(self.bias)
        # Initialize importance weights to encourage exploration
        with torch.no_grad():
            # Move tensors to correct device if needed
            init_mean = torch.tensor([0.4, 0.3, 0.3], 
                                    device=self.weight_mean.device,
                                    dtype=self.weight_mean.dtype)
            init_var = torch.tensor([0.4, 0.3, 0.3], 
                                   device=self.weight_var.device,
                                   dtype=self.weight_var.dtype)
            self.weight_mean.data = init_mean
            self.weight_var.data = init_var
    
    def _get_normalized_weights(self) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Get normalized importance weights using a single softmax.
        
        Returns:
            Tuple of (normalized_mean_weights, normalized_var_weights)
        """
        # Single softmax operation (not double like in original)
        norm_mean_weights = F.softmax(self.weight_mean, dim=0)
        norm_var_weights = F.softmax(self.weight_var, dim=0)
        return norm_mean_weights, norm_var_weights
    
    def _check_input_dim(self, x: torch.Tensor) -> None:
        """Check that input has correct dimensions."""
        if x.dim() != 4:
            raise ValueError(f'Expected 4D input (NCHW), got {x.dim()}D input')
        
        # Check number of channels matches expected
        if x.size(1) != self.num_features:
            raise ValueError(
                f'Expected input with {self.num_features} channels, '
                f'got {x.size(1)} channels instead'
            )
    
    def _compute_statistics(self, x: torch.Tensor) -> Tuple[torch.Tensor, ...]:
        """
        Compute all normalization statistics in a single, vectorized pass.
        
        Args:
            x: Input tensor of shape (N, C, H, W)
            
        Returns:
            Tuple containing:
            - bn_mean, bn_var: BatchNorm statistics
            - in_mean, in_var: InstanceNorm statistics  
            - ln_mean, ln_var: LayerNorm statistics
        """
        # BatchNorm: mean/var across (N, H, W) for each channel
        bn_mean = x.mean(dim=[0, 2, 3])  # Shape: (C,)
        bn_var = x.var(dim=[0, 2, 3], unbiased=False)  # Shape: (C,)
        
        # InstanceNorm: mean/var across (H, W) for each sample and channel
        in_mean = x.mean(dim=[2, 3])  # Shape: (N, C)
        in_var = x.var(dim=[2, 3], unbiased=False)  # Shape: (N, C)
        
        # LayerNorm: mean/var across (C, H, W) for each sample
        ln_mean = x.mean(dim=[1, 2, 3], keepdim=True)  # Shape: (N, 1, 1, 1)
        ln_var = x.var(dim=[1, 2, 3], keepdim=True, unbiased=False)  # Shape: (N, 1, 1, 1)
        
        return bn_mean, bn_var, in_mean, in_var, ln_mean, ln_var
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Optimized forward pass.
        
        Args:
            x: Input tensor of shape (N, C, H, W)
            
        Returns:
            Normalized tensor of same shape
        """
        # Validate input shape and dimensions
        self._check_input_dim(x)
        
        N, C, H, W = x.shape
        
        # Get normalized weights
        mean_weights, var_weights = self._get_normalized_weights()
        
        # Compute all statistics in a single vectorized call
        bn_mean, bn_var, in_mean, in_var, ln_mean, ln_var = self._compute_statistics(x)
        
        # Update running statistics for BatchNorm (training only)
        if self.training and self.track_running_stats:
            self.num_batches_tracked.add_(1)
            exp_avg_factor = self.momentum if self.momentum else 1.0 / self.num_batches_tracked.item()
            
            # Update running mean and variance with proper gradient handling
            with torch.no_grad():
                self.running_mean.mul_(1 - exp_avg_factor).add_(bn_mean.detach(), alpha=exp_avg_factor)
                self.running_var.mul_(1 - exp_avg_factor).add_(bn_var.detach(), alpha=exp_avg_factor)
        
        # Select appropriate BatchNorm statistics based on mode
        if self.training or not self.track_running_stats:
            mean_bn, var_bn = bn_mean, bn_var
        else:
            mean_bn, var_bn = self.running_mean, self.running_var
        
        # Reshape for implicit broadcasting (no expand/repeat needed)
        # BatchNorm stats: (C,) -> (1, C, 1, 1)
        mean_bn = mean_bn.view(1, C, 1, 1)
        var_bn = var_bn.view(1, C, 1, 1)
        
        # InstanceNorm stats: (N, C) -> (N, C, 1, 1)
        mean_in = in_mean.view(N, C, 1, 1)
        var_in = in_var.view(N, C, 1, 1)
        
        # LayerNorm stats: already (N, 1, 1, 1) from keepdim=True
        
        # Combine statistics using learned weights
        # Implicit broadcasting handles the rest
        combined_mean = (
            mean_weights[0] * mean_bn +
            mean_weights[1] * mean_in +
            mean_weights[2] * ln_mean
        )
        
        combined_var = (
            var_weights[0] * var_bn +
            var_weights[1] * var_in +
            var_weights[2] * ln_var
        )
        
        # Apply normalization with epsilon for numerical stability
        x_normalized = (x - combined_mean) / torch.sqrt(combined_var + self.eps)
        
        # Apply affine transformation if enabled
        if self.affine:
            # Implicit broadcasting: (C,) -> (1, C, 1, 1) works with (N, C, H, W)
            weight = self.weight.view(1, C, 1, 1)
            bias = self.bias.view(1, C, 1, 1)
            x_normalized = x_normalized * weight + bias
        
        return x_normalized
    
    def extra_repr(self) -> str:
        """String representation for debugging."""
        return (f'{self.num_features}, eps={self.eps}, momentum={self.momentum}, '
                f'affine={self.affine}, track_running_stats={self.track_running_stats}')


# Backward compatibility alias
SwitchableNorm2d_Optimized = SwitchableNorm2d
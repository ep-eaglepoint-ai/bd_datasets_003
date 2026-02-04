"""
Root Mean Square Layer Normalization (RMSNorm) Package.

This package provides robust PyTorch implementations of RMSNorm for deep learning models.
"""

from .rmsnorm import RMSNorm, RMSNormWithResidual

__all__ = ['RMSNorm', 'RMSNormWithResidual']

__version__ = '1.0.0'


import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import AdaIN


def test_module_instantiation_without_parameters():
    module = AdaIN()
    assert isinstance(module, torch.nn.Module)
    assert module.alpha is None
    assert module.style_detach is None


def test_module_instantiation_with_alpha_parameter():
    module = AdaIN(alpha=0.5)
    assert isinstance(module, torch.nn.Module)
    assert module.alpha == 0.5
    assert module.style_detach is None


def test_module_instantiation_with_style_detach_parameter():
    module = AdaIN(style_detach=True)
    assert isinstance(module, torch.nn.Module)
    assert module.alpha is None
    assert module.style_detach is True


def test_module_instantiation_with_both_parameters():
    module = AdaIN(alpha=0.7, style_detach=True)
    assert isinstance(module, torch.nn.Module)
    assert module.alpha == 0.7
    assert module.style_detach is True


def test_module_forward_basic_functionality():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN()
    result = module(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_forward_with_init_alpha():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN(alpha=0.3)
    result = module(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_forward_with_init_style_detach():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN(style_detach=True)
    result = module(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_forward_parameter_override():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN(alpha=0.5, style_detach=False)
    result = module(content, style, alpha=0.8, style_detach=True)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_forward_with_masks():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    module = AdaIN()
    result = module(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_forward_batch_broadcast():
    content = torch.randn(4, 3, 32, 32)
    style = torch.randn(1, 3, 32, 32)
    module = AdaIN()
    result = module(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_forward_mixed_precision():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    module = AdaIN()
    result = module(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()


def test_module_gradient_flow():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    module = AdaIN()
    result = module(content, style)
    loss = result.sum()
    loss.backward()
    assert content.grad is not None
    assert style.grad is not None
    assert torch.isfinite(content.grad).all()
    assert torch.isfinite(style.grad).all()


def test_module_style_detach_blocks_gradients():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    module = AdaIN(style_detach=True)
    result = module(content, style)
    loss = result.sum()
    loss.backward()
    assert content.grad is not None
    assert style.grad is None
    assert torch.isfinite(content.grad).all()


def test_module_equivalence_with_functional_api():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
    from adain import adain
    
    functional_result = adain(content, style)
    module = AdaIN()
    module_result = module(content, style)
    
    assert torch.allclose(functional_result, module_result, atol=1e-6)

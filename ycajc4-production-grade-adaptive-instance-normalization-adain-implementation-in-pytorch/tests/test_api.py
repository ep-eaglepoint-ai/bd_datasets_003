import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain, AdaIN


def test_module_instantiation():
    module = AdaIN()
    assert isinstance(module, torch.nn.Module)
    assert module.alpha is None
    assert module.style_detach is None


def test_module_instantiation_with_params():
    module = AdaIN(alpha=0.5, style_detach=True)
    assert module.alpha == 0.5
    assert module.style_detach is True


def test_module_forward_basic():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN()
    result = module(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_forward_with_init_params():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN(alpha=0.3, style_detach=True)
    result = module(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_forward_override_params():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN(alpha=0.5, style_detach=False)
    result = module(content, style, alpha=0.8, style_detach=True)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_with_masks():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    module = AdaIN()
    result = module(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_equivalence_functional():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    functional_result = adain(content, style)
    module = AdaIN()
    module_result = module(content, style)
    
    assert torch.allclose(functional_result, module_result, atol=1e-6)


def test_module_equivalence_with_params():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    functional_result = adain(content, style, alpha=0.7, style_detach=True)
    module = AdaIN(alpha=0.7, style_detach=True)
    module_result = module(content, style)
    
    assert torch.allclose(functional_result, module_result, atol=1e-6)


def test_module_parameter_precedence():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    module = AdaIN(alpha=0.3, style_detach=False)
    module_result = module(content, style)
    
    functional_result = adain(content, style, alpha=0.3, style_detach=False)
    assert torch.allclose(module_result, functional_result, atol=1e-6)
    
    override_result = module(content, style, alpha=0.9, style_detach=True)
    functional_override = adain(content, style, alpha=0.9, style_detach=True)
    assert torch.allclose(override_result, functional_override, atol=1e-6)


def test_module_batch_broadcast():
    content = torch.randn(4, 2, 16, 16)
    style = torch.randn(1, 2, 16, 16)
    module = AdaIN()
    result = module(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_module_mixed_precision():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    module = AdaIN()
    result = module(content, style)
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()


def test_module_gradients():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    module = AdaIN()
    result = module(content, style)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    style_grad = torch.autograd.grad(result.sum(), style, retain_graph=True)[0]
    
    assert content_grad is not None
    assert style_grad is not None
    assert torch.isfinite(content_grad).all()
    assert torch.isfinite(style_grad).all()


def test_module_style_detach():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    module = AdaIN(style_detach=True)
    result = module(content, style)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    try:
        torch.autograd.grad(result.sum(), style)
        assert False, "Should have raised RuntimeError"
    except RuntimeError:
        pass


if __name__ == "__main__":
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN(alpha=0.5)
    result = module(content, style)
    print(f"AdaIN module test passed: {result.shape}")

import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain, AdaIN


def test_module_forward_equivalence_functional():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    functional_result = adain(content, style)
    module = AdaIN()
    module_result = module(content, style)
    
    assert torch.allclose(functional_result, module_result, atol=1e-6)


def test_module_with_init_params():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    functional_result = adain(content, style, alpha=0.7, style_detach=True)
    module = AdaIN(alpha=0.7, style_detach=True)
    module_result = module(content, style)
    
    assert torch.allclose(functional_result, module_result, atol=1e-6)


def test_module_parameter_override():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    module = AdaIN(alpha=0.3, style_detach=False)
    module_result = module(content, style)
    functional_result = adain(content, style, alpha=0.3, style_detach=False)
    assert torch.allclose(module_result, functional_result, atol=1e-6)
    
    override_result = module(content, style, alpha=0.9, style_detach=True)
    functional_override = adain(content, style, alpha=0.9, style_detach=True)
    assert torch.allclose(override_result, functional_override, atol=1e-6)


def test_module_gradient_flow():
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


def test_module_detach_style():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    module = AdaIN(style_detach=True)
    result = module(content, style)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)


def test_module_dtype_preservation():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    module = AdaIN()
    result = module(content, style)
    assert result.dtype == torch.float16

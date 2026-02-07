import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_detach_style_blocks_gradients():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    result = adain(content, style, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    style_grad = torch.autograd.grad(result.sum(), style, allow_unused=True)[0]
    assert style_grad is None


def test_style_gradient_flows_when_not_detached():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    result = adain(content, style, style_detach=False)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    style_grad = torch.autograd.grad(result.sum(), style, retain_graph=True)[0]
    
    assert content_grad is not None
    assert style_grad is not None
    assert torch.isfinite(content_grad).all()
    assert torch.isfinite(style_grad).all()


def test_detach_style_with_masks():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    content_mask = torch.ones(2, 3, 32, 32, requires_grad=True)
    style_mask = torch.ones(2, 3, 32, 32, requires_grad=True)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    mask_grad = torch.autograd.grad(result.sum(), content_mask, retain_graph=True)[0]
    
    assert content_grad is not None
    assert mask_grad is not None
    assert torch.isfinite(content_grad).all()
    assert torch.isfinite(mask_grad).all()
    
    style_grad = torch.autograd.grad(result.sum(), style, allow_unused=True)[0]
    mask_style_grad = torch.autograd.grad(result.sum(), style_mask, allow_unused=True)[0]
    
    assert style_grad is None
    assert mask_style_grad is None


def test_detach_style_type_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(TypeError, match="style_detach must be bool or None"):
        adain(content, style, style_detach="true")
    
    with pytest.raises(TypeError, match="style_detach must be bool or None"):
        adain(content, style, style_detach=1)

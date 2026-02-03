import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_style_detach_false_default():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    result = adain(content, style, style_detach=False)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    style_grad = torch.autograd.grad(result.sum(), style, retain_graph=True)[0]
    
    assert content_grad is not None
    assert style_grad is not None
    assert torch.isfinite(content_grad).all()
    assert torch.isfinite(style_grad).all()


def test_style_detach_true():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    result = adain(content, style, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)


def test_style_detach_none_default():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    result = adain(content, style, style_detach=None)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    style_grad = torch.autograd.grad(result.sum(), style, retain_graph=True)[0]
    
    assert content_grad is not None
    assert style_grad is not None
    assert torch.isfinite(content_grad).all()
    assert torch.isfinite(style_grad).all()


def test_style_detach_with_masks():
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
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style_mask)


def test_style_detach_with_alpha():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    result = adain(content, style, alpha=0.5, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)


def test_style_detach_batch_broadcast():
    content = torch.randn(4, 2, 16, 16, requires_grad=True)
    style = torch.randn(1, 2, 16, 16, requires_grad=True)
    result = adain(content, style, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)


def test_style_detach_mixed_precision():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16, requires_grad=True)
    result = adain(content, style, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)


def test_style_detach_3d_spatial():
    content = torch.randn(2, 3, 8, 16, 16, requires_grad=True)
    style = torch.randn(2, 3, 8, 16, 16, requires_grad=True)
    result = adain(content, style, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)


def test_style_detach_zero_variance():
    content = torch.ones(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    result = adain(content, style, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)


def test_style_detach_type_validation():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    
    with pytest.raises(TypeError):
        adain(content, style, style_detach="true")
    
    with pytest.raises(TypeError):
        adain(content, style, style_detach=1)
    
    with pytest.raises(TypeError):
        adain(content, style, style_detach=[])


def test_style_detach_content_only():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=False)
    result = adain(content, style, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    
    assert content_grad is not None
    assert torch.isfinite(content_grad).all()


def test_style_detach_style_only():
    content = torch.randn(2, 3, 32, 32, requires_grad=False)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    result = adain(content, style, style_detach=True)
    
    assert result.requires_grad == content.requires_grad
    
    with pytest.raises(RuntimeError):
        torch.autograd.grad(result.sum(), style)


def test_style_detach_no_global_nograd():
    content = torch.randn(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    
    result = adain(content, style, style_detach=True)
    
    assert content.requires_grad
    assert style.requires_grad
    assert result.requires_grad

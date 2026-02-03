import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_broadcast_masks_gradients_combined():
    content = torch.randn(4, 3, 32, 32, requires_grad=True)
    style = torch.randn(1, 3, 32, 32, requires_grad=True)
    content_mask = torch.ones(4, 3, 32, 32, requires_grad=True)
    style_mask = torch.ones(1, 3, 32, 32, requires_grad=True)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask, style_detach=False)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    style_grad = torch.autograd.grad(result.sum(), style, retain_graph=True)[0]
    content_mask_grad = torch.autograd.grad(result.sum(), content_mask, retain_graph=True)[0]
    style_mask_grad = torch.autograd.grad(result.sum(), style_mask, retain_graph=True)[0]
    
    assert content_grad is not None
    assert style_grad is not None
    assert content_mask_grad is not None
    assert style_mask_grad is not None
    
    assert torch.isfinite(content_grad).all()
    assert torch.isfinite(style_grad).all()
    assert torch.isfinite(content_mask_grad).all()
    assert torch.isfinite(style_mask_grad).all()


def test_broadcast_masks_gradients_detach():
    content = torch.randn(4, 3, 32, 32, requires_grad=True)
    style = torch.randn(1, 3, 32, 32, requires_grad=True)
    content_mask = torch.ones(4, 3, 32, 32, requires_grad=True)
    style_mask = torch.ones(1, 3, 32, 32, requires_grad=True)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    content_mask_grad = torch.autograd.grad(result.sum(), content_mask, retain_graph=True)[0]
    
    style_grad = torch.autograd.grad(result.sum(), style, allow_unused=True)[0]
    style_mask_grad = torch.autograd.grad(result.sum(), style_mask, allow_unused=True)[0]
    
    assert content_grad is not None
    assert content_mask_grad is not None
    assert style_grad is None
    assert style_mask_grad is None
    
    assert torch.isfinite(content_grad).all()
    assert torch.isfinite(content_mask_grad).all()


def test_everything_at_once():
    content = torch.randn(3, 4, 8, 16, 32, requires_grad=True, dtype=torch.float16)
    style = torch.randn(1, 4, 8, 16, 32, requires_grad=True, dtype=torch.float16)
    content_mask = torch.ones(3, 4, 8, 16, 32, requires_grad=True, dtype=torch.float16)
    style_mask = torch.ones(1, 4, 8, 16, 32, requires_grad=True, dtype=torch.float16)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask, 
                  alpha=0.75, style_detach=False)
    
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    style_grad = torch.autograd.grad(result.sum(), style, retain_graph=True)[0]
    content_mask_grad = torch.autograd.grad(result.sum(), content_mask, retain_graph=True)[0]
    style_mask_grad = torch.autograd.grad(result.sum(), style_mask, retain_graph=True)[0]
    
    assert content_grad is not None
    assert style_grad is not None
    assert content_mask_grad is not None
    assert style_mask_grad is not None
    
    assert torch.isfinite(content_grad).all()
    assert torch.isfinite(style_grad).all()
    assert torch.isfinite(content_mask_grad).all()
    assert torch.isfinite(style_mask_grad).all()

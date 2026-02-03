import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_content_tensor_type_validation():
    with pytest.raises(TypeError, match="content must be torch.Tensor"):
        adain("not_tensor", torch.randn(1, 3, 32, 32))


def test_style_tensor_type_validation():
    with pytest.raises(TypeError, match="style must be torch.Tensor"):
        adain(torch.randn(1, 3, 32, 32), "not_tensor")


def test_content_floating_point_validation():
    with pytest.raises(TypeError, match="content must be floating point dtype"):
        adain(torch.randint(0, 255, (1, 3, 32, 32)), torch.randn(1, 3, 32, 32))


def test_style_floating_point_validation():
    with pytest.raises(TypeError, match="style must be floating point dtype"):
        adain(torch.randn(1, 3, 32, 32), torch.randint(0, 255, (1, 3, 32, 32)))


def test_content_dimensionality_validation():
    with pytest.raises(ValueError, match="content must have at least 3 dimensions"):
        adain(torch.randn(3, 32), torch.randn(1, 3, 32, 32))


def test_style_dimensionality_validation():
    with pytest.raises(ValueError, match="style must have at least 3 dimensions"):
        adain(torch.randn(1, 3, 32, 32), torch.randn(3, 32))


def test_channel_count_mismatch_validation():
    with pytest.raises(ValueError, match="content and style must have identical channel count"):
        adain(torch.randn(1, 3, 32, 32), torch.randn(1, 5, 32, 32))


def test_content_nan_validation():
    content = torch.randn(1, 3, 32, 32)
    content[0, 0, 0, 0] = float('nan')
    with pytest.raises(ValueError, match="content contains NaN or Inf values"):
        adain(content, torch.randn(1, 3, 32, 32))


def test_content_inf_validation():
    content = torch.randn(1, 3, 32, 32)
    content[0, 0, 0, 0] = float('inf')
    with pytest.raises(ValueError, match="content contains NaN or Inf values"):
        adain(content, torch.randn(1, 3, 32, 32))


def test_style_nan_validation():
    style = torch.randn(1, 3, 32, 32)
    style[0, 0, 0, 0] = float('nan')
    with pytest.raises(ValueError, match="style contains NaN or Inf values"):
        adain(torch.randn(1, 3, 32, 32), style)


def test_style_inf_validation():
    style = torch.randn(1, 3, 32, 32)
    style[0, 0, 0, 0] = float('inf')
    with pytest.raises(ValueError, match="style contains NaN or Inf values"):
        adain(torch.randn(1, 3, 32, 32), style)


def test_valid_inputs_no_failure():
    content = torch.randn(2, 4, 32, 32)
    style = torch.randn(2, 4, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_valid_3d_inputs():
    content = torch.randn(2, 4, 16)
    style = torch.randn(2, 4, 16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_valid_5d_inputs():
    content = torch.randn(2, 4, 8, 16, 16)
    style = torch.randn(2, 4, 8, 16, 16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_valid_different_dtypes():
    content = torch.randn(1, 3, 32, 32, dtype=torch.float32)
    style = torch.randn(1, 3, 32, 32, dtype=torch.float32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()

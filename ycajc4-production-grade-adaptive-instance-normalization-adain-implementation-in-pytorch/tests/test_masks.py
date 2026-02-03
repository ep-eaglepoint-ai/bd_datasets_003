import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_content_mask_none():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style, content_mask=None, style_mask=None)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_style_mask_none():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    result = adain(content, style, content_mask=content_mask, style_mask=None)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_content_mask_type_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    with pytest.raises(TypeError, match="content_mask must be torch.Tensor or None"):
        adain(content, style, content_mask="not_tensor", style_mask=None)


def test_style_mask_type_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    with pytest.raises(TypeError, match="style_mask must be torch.Tensor or None"):
        adain(content, style, content_mask=None, style_mask="not_tensor")


def test_content_mask_dimensionality_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32)
    with pytest.raises(ValueError, match="content_mask must have 4 dimensions"):
        adain(content, style, content_mask=content_mask, style_mask=None)


def test_style_mask_dimensionality_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32)
    with pytest.raises(ValueError, match="style_mask must have 4 dimensions"):
        adain(content, style, content_mask=None, style_mask=style_mask)


def test_content_mask_batch_size_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(3, 3, 32, 32)
    with pytest.raises(ValueError, match="content_mask batch size must match content batch size"):
        adain(content, style, content_mask=content_mask, style_mask=None)


def test_style_mask_batch_size_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style_mask = torch.ones(3, 3, 32, 32)
    with pytest.raises(ValueError, match="style_mask batch size must match style batch size"):
        adain(content, style, content_mask=None, style_mask=style_mask)


def test_content_mask_channel_count_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 2, 32, 32)
    with pytest.raises(ValueError, match="content_mask channel count must be 1 or 3"):
        adain(content, style, content_mask=content_mask, style_mask=None)


def test_style_mask_channel_count_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style_mask = torch.ones(2, 2, 32, 32)
    with pytest.raises(ValueError, match="style_mask channel count must be 1 or 3"):
        adain(content, style, content_mask=None, style_mask=style_mask)


def test_content_mask_spatial_dimension_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 16, 32)
    with pytest.raises(ValueError, match="content_mask spatial dimension 2 must match content"):
        adain(content, style, content_mask=content_mask, style_mask=None)


def test_style_mask_spatial_dimension_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 16, 32)
    with pytest.raises(ValueError, match="style_mask spatial dimension 2 must match style"):
        adain(content, style, content_mask=None, style_mask=style_mask)


def test_content_mask_dtype_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32, dtype=torch.int32)
    with pytest.raises(TypeError, match="content_mask must be floating point dtype"):
        adain(content, style, content_mask=content_mask, style_mask=None)


def test_style_mask_dtype_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32, dtype=torch.int32)
    with pytest.raises(TypeError, match="style_mask must be floating point dtype"):
        adain(content, style, content_mask=None, style_mask=style_mask)


def test_content_mask_value_range_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32) * 1.5
    with pytest.raises(ValueError, match="content_mask values must be in range \\[0, 1\\]"):
        adain(content, style, content_mask=content_mask, style_mask=None)


def test_style_mask_value_range_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32) * -0.5
    with pytest.raises(ValueError, match="style_mask values must be in range \\[0, 1\\]"):
        adain(content, style, content_mask=None, style_mask=style_mask)


def test_mask_single_channel():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 1, 32, 32)
    style_mask = torch.ones(2, 1, 32, 32)
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_mask_multi_channel():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_mask_partial_coverage():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.zeros(2, 3, 32, 32)
    content_mask[:, :, 16:, :] = 1.0
    result = adain(content, style, content_mask=content_mask, style_mask=None)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_mask_all_zeros():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.zeros(2, 3, 32, 32)
    result = adain(content, style, content_mask=content_mask, style_mask=None)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_mask_all_ones():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    result = adain(content, style, content_mask=content_mask, style_mask=None)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_mask_statistics_correctness():
    content = torch.ones(2, 2, 4, 4)
    content[:, :, 2:, 2:] = 3.0
    style = torch.zeros(2, 2, 4, 4)
    style[:, :, :, :] = 2.0
    
    content_mask = torch.zeros(2, 2, 4, 4)
    content_mask[:, :, 2:, 2:] = 1.0
    
    result = adain(content, style, content_mask=content_mask, style_mask=None)
    
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    masked_region = result[:, :, 2:, 2:]
    unmasked_region = result[:, :, :2, :2]
    
    assert torch.allclose(masked_region.mean(), style.mean(), atol=1e-6)
    assert torch.allclose(masked_region.std(unbiased=False), style.std(unbiased=False), atol=1e-6)
    assert not torch.allclose(unmasked_region.mean(), style.mean(), atol=1e-6)


def test_mask_3d_spatial():
    content = torch.randn(2, 3, 8, 16, 16)
    style = torch.randn(2, 3, 8, 16, 16)
    content_mask = torch.ones(2, 3, 8, 16, 16)
    style_mask = torch.ones(2, 3, 8, 16, 16)
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_mask_broadcast_single_style():
    content = torch.randn(4, 2, 16, 16)
    style = torch.randn(1, 2, 16, 16)
    content_mask = torch.ones(4, 2, 16, 16)
    style_mask = torch.ones(1, 2, 16, 16)
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_mask_equivalence_with_none():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    result_no_mask = adain(content, style, content_mask=None, style_mask=None)
    
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    result_with_mask = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    
    assert torch.allclose(result_no_mask, result_with_mask, atol=1e-6)

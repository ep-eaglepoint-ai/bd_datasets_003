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


def test_alpha_non_scalar_tensor_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    alpha_tensor = torch.tensor([0.5, 0.7])
    
    with pytest.raises(TypeError, match="alpha must be scalar tensor"):
        adain(content, style, alpha=alpha_tensor)


def test_alpha_multi_dimensional_tensor_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    alpha_tensor = torch.tensor([[0.5]])
    
    with pytest.raises(TypeError, match="alpha must be scalar tensor"):
        adain(content, style, alpha=alpha_tensor)


def test_alpha_empty_tensor_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    alpha_tensor = torch.tensor([])
    
    with pytest.raises(TypeError, match="alpha must be scalar tensor"):
        adain(content, style, alpha=alpha_tensor)


def test_content_empty_tensor_validation():
    content = torch.empty(0, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(ValueError, match="content batch size must be greater than 0"):
        adain(content, style)


def test_style_empty_tensor_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.empty(0, 3, 32, 32)
    
    with pytest.raises(ValueError, match="style batch size must be 1 or equal to content batch size"):
        adain(content, style)


def test_extremely_large_tensor_handling():
    try:
        content = torch.randn(1, 1, 1024, 1024)
        style = torch.randn(1, 1, 1024, 1024)
        result = adain(content, style)
        assert result.shape == content.shape
        assert torch.isfinite(result).all()
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            pytest.skip("Not enough memory for large tensor test")
        else:
            raise


def test_memory_efficiency_validation():
    import gc
    
    initial_tensors = len([obj for obj in gc.get_objects() if torch.is_tensor(obj)])
    
    content = torch.randn(10, 100, 32, 32)
    style = torch.randn(1, 100, 32, 32)
    
    for _ in range(10):
        result = adain(content, style)
        del result
    
    gc.collect()
    final_tensors = len([obj for obj in gc.get_objects() if torch.is_tensor(obj)])
    
    assert final_tensors - initial_tensors < 20


def test_alpha_string_type_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(TypeError, match="alpha must be float or scalar tensor"):
        adain(content, style, alpha="0.5")


def test_alpha_complex_type_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(TypeError, match="alpha must be float or scalar tensor"):
        adain(content, style, alpha=[0.5])


def test_style_detach_string_type_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(TypeError, match="style_detach must be bool or None"):
        adain(content, style, style_detach="true")


def test_style_detach_int_type_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(TypeError, match="style_detach must be bool or None"):
        adain(content, style, style_detach=1)


def test_style_detach_float_type_validation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(TypeError, match="style_detach must be bool or None"):
        adain(content, style, style_detach=0.0)


def test_content_zero_channels_validation():
    content = torch.randn(2, 0, 32, 32)
    style = torch.randn(2, 0, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_style_zero_channels_validation():
    content = torch.randn(2, 0, 32, 32)
    style = torch.randn(2, 0, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_content_zero_spatial_dimension_validation():
    content = torch.randn(2, 3, 0, 32)
    style = torch.randn(2, 3, 0, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_style_zero_spatial_dimension_validation():
    content = torch.randn(2, 3, 0, 32)
    style = torch.randn(2, 3, 0, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()

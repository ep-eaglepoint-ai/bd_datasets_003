import pytest
import torch
import torch.nn.functional as F
from repository_after.adain import adain


class TestMixedPrecisionMaskStability:
    """Test mixed-precision stability with masks containing all-zero regions."""
    
    @pytest.mark.parametrize("dtype", [torch.float16, torch.bfloat16, torch.float32])
    def test_mixed_precision_mask_all_zero_regions(self, dtype):
        """Test numerical stability with all-zero mask regions in mixed precision."""
        content = torch.randn(2, 4, 16, 16, dtype=dtype)
        style = torch.randn(2, 4, 16, 16, dtype=dtype)
        
        # Create mask with all-zero regions for different scenarios
        content_mask = torch.zeros(2, 1, 16, 16, dtype=dtype)
        style_mask = torch.zeros(2, 1, 16, 16, dtype=dtype)
        
        with pytest.raises(ValueError, match="content_mask must cover at least one spatial element per channel"):
            adain(content, style, content_mask=content_mask, style_mask=style_mask)
    
    @pytest.mark.parametrize("dtype", [torch.float16, torch.bfloat16])
    def test_mixed_precision_partial_zero_masks(self, dtype):
        """Test stability with partially zero masks in mixed precision."""
        content = torch.randn(2, 4, 16, 16, dtype=dtype)
        style = torch.randn(2, 4, 16, 16, dtype=dtype)
        
        # Create masks with partial zero regions
        content_mask = torch.ones(2, 1, 16, 16, dtype=dtype)
        content_mask[:, :, :8, :] = 0.0  # Zero first half
        
        style_mask = torch.ones(2, 1, 16, 16, dtype=dtype)
        style_mask[:, :, :, :8] = 0.0  # Zero second half
        
        result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
        
        # Stability checks
        assert torch.isfinite(result).all(), f"Partial zero mask failed for dtype {dtype}"
        assert result.dtype == dtype, f"Output dtype mismatch for {dtype}"
        
        # Verify masked regions are handled correctly
        result_std = result.std(dim=(2, 3), keepdim=True)
        assert torch.all(result_std > 0), f"Partial zero mask std should be > 0 for dtype {dtype}"
    
    @pytest.mark.parametrize("dtype", [torch.float16, torch.bfloat16])
    def test_mixed_precision_tiny_values_with_zero_masks(self, dtype):
        """Test stability with tiny values and zero masks in mixed precision."""
        content = torch.full((2, 4, 16, 16), 1e-6, dtype=dtype)
        style = torch.full((2, 4, 16, 16), 2e-6, dtype=dtype)
        
        # All-zero masks
        content_mask = torch.zeros(2, 1, 16, 16, dtype=dtype)
        style_mask = torch.zeros(2, 1, 16, 16, dtype=dtype)
        
        with pytest.raises(ValueError, match="content_mask must cover at least one spatial element per channel"):
            adain(content, style, content_mask=content_mask, style_mask=style_mask)
    
    @pytest.mark.parametrize("dtype", [torch.float16, torch.bfloat16])
    def test_mixed_precision_extreme_values_zero_masks(self, dtype):
        """Test stability with extreme values and zero masks in mixed precision."""
        content = torch.full((2, 4, 8, 8), 1e4, dtype=dtype)
        style = torch.full((2, 4, 8, 8), -1e4, dtype=dtype)
        
        # All-zero masks
        content_mask = torch.zeros(2, 1, 8, 8, dtype=dtype)
        style_mask = torch.zeros(2, 1, 8, 8, dtype=dtype)
        
        with pytest.raises(ValueError, match="content_mask must cover at least one spatial element per channel"):
            adain(content, style, content_mask=content_mask, style_mask=style_mask)
    
    def test_mixed_precision_dtype_consistency(self):
        """Test that mixed precision maintains dtype consistency."""
        content_f16 = torch.randn(2, 4, 16, 16, dtype=torch.float16)
        style_f16 = torch.randn(2, 4, 16, 16, dtype=torch.float16)
        content_f32 = content_f16.to(torch.float32)
        style_f32 = style_f16.to(torch.float32)
        
        mask = torch.zeros(2, 1, 16, 16, dtype=torch.float16)
        
        # Test that different dtypes produce consistent behavior
        with pytest.raises(ValueError, match="content_mask must cover at least one spatial element per channel"):
            adain(content_f16, style_f16, content_mask=mask, style_mask=mask)
        with pytest.raises(ValueError, match="content_mask must cover at least one spatial element per channel"):
            adain(content_f32, style_f32, content_mask=mask.to(torch.float32), style_mask=mask.to(torch.float32))

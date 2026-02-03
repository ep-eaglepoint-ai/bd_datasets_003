import torch


def adain(content, style, content_mask=None, style_mask=None, alpha=None, style_detach=None):
    if not isinstance(content, torch.Tensor):
        raise TypeError(f"content must be torch.Tensor, got {type(content)}")
    
    if not isinstance(style, torch.Tensor):
        raise TypeError(f"style must be torch.Tensor, got {type(style)}")
    
    if alpha is not None:
        if not isinstance(alpha, (float, torch.Tensor)):
            raise TypeError(f"alpha must be float or scalar tensor, got {type(alpha)}")
        
        if isinstance(alpha, torch.Tensor):
            if alpha.numel() != 1 or alpha.dim() != 0:
                raise TypeError(f"alpha must be scalar tensor, got tensor with {alpha.numel()} elements and {alpha.dim()} dimensions")
            alpha = alpha.item()
        
        if not (0.0 <= alpha <= 1.0):
            raise ValueError(f"alpha must be in range [0, 1], got {alpha}")
    
    if style_detach is not None:
        if not isinstance(style_detach, bool):
            raise TypeError(f"style_detach must be bool or None, got {type(style_detach)}")
    
    if not torch.is_floating_point(content):
        raise TypeError(f"content must be floating point dtype, got {content.dtype}")
    
    if not torch.is_floating_point(style):
        raise TypeError(f"style must be floating point dtype, got {style.dtype}")
    
    if content.dim() < 3:
        raise ValueError(f"content must have at least 3 dimensions (N, C, *spatial), got {content.dim()}")
    
    if style.dim() < 3:
        raise ValueError(f"style must have at least 3 dimensions (N, C, *spatial), got {style.dim()}")
    
    if content.shape[1] != style.shape[1]:
        raise ValueError(f"content and style must have identical channel count, got {content.shape[1]} and {style.shape[1]}")
    
    if not torch.isfinite(content).all():
        raise ValueError("content contains NaN or Inf values")
    
    if not torch.isfinite(style).all():
        raise ValueError("style contains NaN or Inf values")
    
    content_batch_size = content.shape[0]
    style_batch_size = style.shape[0]
    
    if content_batch_size <= 0:
        raise ValueError(f"content batch size must be greater than 0, got {content_batch_size}")
    
    if style_batch_size == 1:
        style = style.expand(content_batch_size, -1, *([-1] * (content.dim() - 2)))
        if style_mask is not None:
            style_mask = style_mask.expand(content_batch_size, -1, *([-1] * (content.dim() - 2)))
    elif style_batch_size == content_batch_size:
        pass
    else:
        raise ValueError(f"style batch size must be 1 or equal to content batch size, got {style_batch_size} and {content_batch_size}")
    
    if style_detach:
        style = style.detach()
        if style_mask is not None:
            style_mask = style_mask.detach()
    
    spatial_dims = list(range(2, content.dim()))
    
    if content_mask is not None:
        if not isinstance(content_mask, torch.Tensor):
            raise TypeError(f"content_mask must be torch.Tensor or None, got {type(content_mask)}")
        
        if content_mask.dim() != content.dim():
            raise ValueError(f"content_mask must have {content.dim()} dimensions, got {content_mask.dim()}")
        
        if content_mask.shape[0] != content.shape[0]:
            raise ValueError(f"content_mask batch size must match content batch size, got {content_mask.shape[0]} and {content.shape[0]}")
        
        if content_mask.shape[1] not in (1, content.shape[1]):
            raise ValueError(f"content_mask channel count must be 1 or {content.shape[1]}, got {content_mask.shape[1]}")
        
        for i in range(2, content.dim()):
            if content_mask.shape[i] != content.shape[i]:
                raise ValueError(f"content_mask spatial dimension {i} must match content, got {content_mask.shape[i]} and {content.shape[i]}")
        
        if not torch.is_floating_point(content_mask):
            raise TypeError(f"content_mask must be floating point dtype, got {content_mask.dtype}")
        
        if not torch.all((content_mask >= 0) & (content_mask <= 1)):
            raise ValueError("content_mask values must be in range [0, 1]")
    
    if style_mask is not None:
        if not isinstance(style_mask, torch.Tensor):
            raise TypeError(f"style_mask must be torch.Tensor or None, got {type(style_mask)}")
        
        if style_mask.dim() != style.dim():
            raise ValueError(f"style_mask must have {style.dim()} dimensions, got {style_mask.dim()}")
        
        if style_mask.shape[0] != style.shape[0]:
            raise ValueError(f"style_mask batch size must match style batch size, got {style_mask.shape[0]} and {style.shape[0]}")
        
        if style_mask.shape[1] not in (1, style.shape[1]):
            raise ValueError(f"style_mask channel count must be 1 or {style.shape[1]}, got {style_mask.shape[1]}")
        
        for i in range(2, style.dim()):
            if style_mask.shape[i] != style.shape[i]:
                raise ValueError(f"style_mask spatial dimension {i} must match style, got {style_mask.shape[i]} and {style.shape[i]}")
        
        if not torch.is_floating_point(style_mask):
            raise TypeError(f"style_mask must be floating point dtype, got {style_mask.dtype}")
        
        if not torch.all((style_mask >= 0) & (style_mask <= 1)):
            raise ValueError("style_mask values must be in range [0, 1]")
    
    def compute_masked_stats(tensor, mask):
        if mask is None:
            mean = tensor.mean(dim=spatial_dims, keepdim=True)
            std = tensor.std(dim=spatial_dims, keepdim=True, unbiased=False)
        else:
            if mask.shape[1] == 1:
                mask = mask.expand_as(tensor)
            
            mask_sum = mask.sum(dim=spatial_dims, keepdim=True)
            # Use dtype-aware epsilon for numerical stability
            mask_eps = torch.tensor(1e-8, dtype=tensor.dtype, device=tensor.device)
            mask_sum = torch.maximum(mask_sum, mask_eps)
            
            weighted_sum = (tensor * mask).sum(dim=spatial_dims, keepdim=True)
            mean = weighted_sum / mask_sum
            
            weighted_var = ((tensor - mean) ** 2 * mask).sum(dim=spatial_dims, keepdim=True)
            # Use dtype-aware sqrt to handle fp16 limitations on CPU
            if tensor.dtype == torch.float16 and not tensor.is_cuda:
                std = torch.sqrt(weighted_var.to(torch.float32) / mask_sum).to(tensor.dtype)
            else:
                std = torch.sqrt(weighted_var / mask_sum)
        
        return mean, std
    
    content_mean, content_std = compute_masked_stats(content, content_mask)
    style_mean, style_std = compute_masked_stats(style, style_mask)
    
    # Dtype-aware epsilon for numerical stability
    eps = 1e-6 if content.dtype == torch.float16 else 1e-8
    eps_tensor = torch.tensor(eps, dtype=content.dtype, device=content.device)
    content_std = torch.maximum(content_std, eps_tensor)
    style_std = torch.maximum(style_std, eps_tensor)
    
    normalized_content = (content - content_mean) / content_std
    result = normalized_content * style_std + style_mean
    
    if alpha is not None:
        # Use dtype-consistent alpha interpolation
        alpha_tensor = torch.tensor(alpha, dtype=content.dtype, device=content.device)
        one_minus_alpha = torch.tensor(1.0 - alpha, dtype=content.dtype, device=content.device)
        result = alpha_tensor * result + one_minus_alpha * content
    
    if not torch.isfinite(result).all():
        raise ValueError("Output contains NaN or Inf values - numerical stability violated")
    
    return result


class AdaIN(torch.nn.Module):
    def __init__(self, alpha=None, style_detach=None):
        super().__init__()
        self.alpha = alpha
        self.style_detach = style_detach
    
    def forward(self, content, style, content_mask=None, style_mask=None, alpha=None, style_detach=None):
        return adain(content, style, content_mask=content_mask, style_mask=style_mask, 
                   alpha=alpha if alpha is not None else self.alpha,
                   style_detach=style_detach if style_detach is not None else self.style_detach)


if __name__ == "__main__":
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    module = AdaIN(alpha=0.5)
    result = module(content, style)
    print(f"AdaIN module test passed: {result.shape}")

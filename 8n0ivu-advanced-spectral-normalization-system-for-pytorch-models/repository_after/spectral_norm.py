"""
Advanced Spectral Normalization System for PyTorch Models.
"""

from __future__ import annotations

import math
from typing import Any, Callable, List, Optional, Sequence, Set, Tuple, Type, Union

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from torch.nn.utils.parametrize import register_parametrization, remove_parametrizations


_CONV_TYPES: Tuple[Type[nn.Module], ...] = (nn.Conv1d, nn.Conv2d, nn.Conv3d)

_CONV_TRANSPOSE_TYPES: Tuple[Type[nn.Module], ...] = (
    nn.ConvTranspose1d, nn.ConvTranspose2d, nn.ConvTranspose3d,
)

_LINEAR_TYPES: Tuple[Type[nn.Module], ...] = (nn.Linear,)

_LAZY_TYPES: Tuple[Type[nn.Module], ...] = (
    nn.LazyLinear, nn.LazyConv1d, nn.LazyConv2d, nn.LazyConv3d,
    nn.LazyConvTranspose1d, nn.LazyConvTranspose2d, nn.LazyConvTranspose3d,
)

_LAZY_CONV_TRANSPOSE_TYPES: Tuple[Type[nn.Module], ...] = (
    nn.LazyConvTranspose1d, nn.LazyConvTranspose2d, nn.LazyConvTranspose3d,
)

_ALL_SUPPORTED_TYPES: Tuple[Type[nn.Module], ...] = (
    _CONV_TYPES + _CONV_TRANSPOSE_TYPES + _LINEAR_TYPES + _LAZY_TYPES
)


def _is_conv_transpose(module: nn.Module) -> bool:
    return isinstance(module, _CONV_TRANSPOSE_TYPES + _LAZY_CONV_TRANSPOSE_TYPES)


def _is_lazy_module(module: nn.Module) -> bool:
    return isinstance(module, _LAZY_TYPES)


def _get_weight_shape(weight: Tensor, is_conv_transpose: bool) -> Tuple[int, int]:
    if weight.ndim == 2:
        return weight.shape[0], weight.shape[1]

    if is_conv_transpose:
        out_channels = weight.shape[1]
        rest = weight.shape[0] * int(weight[0, 0].numel())
    else:
        out_channels = weight.shape[0]
        rest = int(weight[0].numel())

    return out_channels, rest


def _reshape_weight_to_matrix(weight: Tensor, is_conv_transpose: bool) -> Tensor:
    if weight.ndim == 2:
        return weight

    if is_conv_transpose:
        weight = weight.permute(1, 0, *range(2, weight.ndim))

    return weight.reshape(weight.shape[0], -1)


class SpectralNormParametrization(nn.Module):
    def __init__(
        self,
        weight: Tensor,
        n_power_iterations: int = 1,
        eps: float = 1e-12,
        is_conv_transpose: bool = False,
        power_iter_on_eval: bool = False,
        stable_fp32: bool = True,
    ) -> None:
        super().__init__()
        self.n_power_iterations = n_power_iterations
        self.eps = eps
        self.is_conv_transpose = is_conv_transpose
        self.power_iter_on_eval = power_iter_on_eval
        self.stable_fp32 = stable_fp32

        h, w = _get_weight_shape(weight, is_conv_transpose)
        u = F.normalize(torch.randn(h), dim=0, eps=self.eps)
        v = F.normalize(torch.randn(w), dim=0, eps=self.eps)

        self.register_buffer("_u", u)
        self.register_buffer("_v", v)

    @torch.autograd.no_grad()
    def _power_iteration(self, weight_matrix: Tensor) -> Tuple[Tensor, Tensor]:
        u = self._u.clone()
        v = self._v.clone()

        for _ in range(self.n_power_iterations):
            v = F.normalize(torch.mv(weight_matrix.t(), u), dim=0, eps=self.eps)
            u = F.normalize(torch.mv(weight_matrix, v), dim=0, eps=self.eps)

        return u, v

    def _compute_sigma(self, weight_matrix: Tensor, u: Tensor, v: Tensor) -> Tensor:
        return torch.dot(u, torch.mv(weight_matrix, v))

    def forward(self, weight: Tensor) -> Tensor:
        original_dtype = weight.dtype
        use_fp32 = self.stable_fp32 and original_dtype in (torch.float16, torch.bfloat16)

        if use_fp32:
            weight_for_norm = weight.float()
        else:
            weight_for_norm = weight

        weight_matrix = _reshape_weight_to_matrix(weight_for_norm, self.is_conv_transpose)

        if self._u.device != weight.device or (use_fp32 and self._u.dtype != torch.float32):
            self._u = self._u.to(device=weight.device, dtype=torch.float32 if use_fp32 else weight.dtype)
            self._v = self._v.to(device=weight.device, dtype=torch.float32 if use_fp32 else weight.dtype)
        elif not use_fp32 and self._u.dtype != weight_for_norm.dtype:
            self._u = self._u.to(dtype=weight_for_norm.dtype)
            self._v = self._v.to(dtype=weight_for_norm.dtype)

        if self.training or self.power_iter_on_eval:
            u, v = self._power_iteration(weight_matrix)
            self._u.copy_(u)
            self._v.copy_(v)
        else:
            u = self._u
            v = self._v

        sigma = self._compute_sigma(weight_matrix, u, v)
        normalized_weight = weight_for_norm / (sigma + self.eps)

        if use_fp32:
            normalized_weight = normalized_weight.to(original_dtype)

        return normalized_weight

    def right_inverse(self, normalized_weight: Tensor) -> Tensor:
        return normalized_weight


class SpectralNormWrapper:
    def __init__(
        self,
        module: nn.Module,
        param_names: Sequence[str],
        n_power_iterations: int,
        eps: float,
        power_iter_on_eval: bool,
        stable_fp32: bool,
        init_on_first_forward: bool,
    ) -> None:
        self.module = module
        self.param_names = list(param_names)
        self.n_power_iterations = n_power_iterations
        self.eps = eps
        self.power_iter_on_eval = power_iter_on_eval
        self.stable_fp32 = stable_fp32
        self.init_on_first_forward = init_on_first_forward
        self._initialized = False
        self._hook_handle: Optional[torch.utils.hooks.RemovableHandle] = None

    def _apply_parametrization(self, param_name: str) -> bool:
        if not hasattr(self.module, param_name):
            return False

        weight = getattr(self.module, param_name)
        if weight is None:
            return False

        if hasattr(weight, 'is_lazy') and weight.is_lazy:
            return False

        is_conv_transpose = _is_conv_transpose(self.module)

        parametrization = SpectralNormParametrization(
            weight=weight,
            n_power_iterations=self.n_power_iterations,
            eps=self.eps,
            is_conv_transpose=is_conv_transpose,
            power_iter_on_eval=self.power_iter_on_eval,
            stable_fp32=self.stable_fp32,
        )

        register_parametrization(self.module, param_name, parametrization)
        return True

    def initialize(self) -> None:
        if self._initialized:
            return

        for param_name in self.param_names:
            self._apply_parametrization(param_name)

        self._initialized = True

        if self._hook_handle is not None:
            self._hook_handle.remove()
            self._hook_handle = None

    def _forward_hook(self, module: nn.Module, args: Tuple[Any, ...], output: Any) -> Any:
        if not self._initialized:
            all_available = True
            for param_name in self.param_names:
                if hasattr(module, param_name):
                    param = getattr(module, param_name)
                    if param is None or (hasattr(param, 'is_lazy') and param.is_lazy):
                        all_available = False
                        break

            if all_available:
                self.initialize()

        return output

    def setup_deferred_init(self) -> None:
        if not self.init_on_first_forward:
            return
        self._hook_handle = self.module.register_forward_hook(self._forward_hook)


def spectral_norm(
    module: nn.Module,
    param_names: Union[str, Sequence[str]] = "weight",
    n_power_iterations: int = 1,
    eps: float = 1e-12,
    power_iter_on_eval: bool = False,
    stable_fp32: bool = True,
    init_on_first_forward: bool = True,
) -> nn.Module:
    if isinstance(param_names, str):
        param_names = [param_names]

    has_any_param = any(hasattr(module, name) for name in param_names)
    if not has_any_param:
        return module

    wrapper = SpectralNormWrapper(
        module=module,
        param_names=param_names,
        n_power_iterations=n_power_iterations,
        eps=eps,
        power_iter_on_eval=power_iter_on_eval,
        stable_fp32=stable_fp32,
        init_on_first_forward=init_on_first_forward,
    )

    if not hasattr(module, "_spectral_norm_wrappers"):
        module._spectral_norm_wrappers = []
    module._spectral_norm_wrappers.append(wrapper)

    is_lazy = _is_lazy_module(module)

    if is_lazy and init_on_first_forward:
        wrapper.setup_deferred_init()
    else:
        wrapper.initialize()

    return module


def remove_spectral_norm(
    module: nn.Module,
    param_names: Union[str, Sequence[str], None] = None,
) -> nn.Module:
    if param_names is None:
        if hasattr(module, "_spectral_norm_wrappers"):
            param_names = set()
            for wrapper in module._spectral_norm_wrappers:
                param_names.update(wrapper.param_names)
            param_names = list(param_names)
        else:
            param_names = ["weight"]
    elif isinstance(param_names, str):
        param_names = [param_names]

    for param_name in param_names:
        if hasattr(module, "parametrizations") and param_name in module.parametrizations:
            parametrizations = module.parametrizations[param_name]
            for p in parametrizations:
                if isinstance(p, SpectralNormParametrization):
                    remove_parametrizations(module, param_name)
                    break

    if hasattr(module, "_spectral_norm_wrappers"):
        for wrapper in module._spectral_norm_wrappers:
            if wrapper._hook_handle is not None:
                wrapper._hook_handle.remove()
        del module._spectral_norm_wrappers

    return module


def apply_spectral_norm(
    model: nn.Module,
    param_names: Union[str, Sequence[str]] = "weight",
    n_power_iterations: int = 1,
    eps: float = 1e-12,
    power_iter_on_eval: bool = False,
    stable_fp32: bool = True,
    init_on_first_forward: bool = True,
    include_types: Optional[Sequence[Type[nn.Module]]] = None,
    exclude_names: Optional[Sequence[str]] = None,
    exclude_types: Optional[Sequence[Type[nn.Module]]] = None,
    predicate: Optional[Callable[[str, nn.Module], bool]] = None,
) -> nn.Module:
    if include_types is None:
        include_types = _ALL_SUPPORTED_TYPES

    if exclude_names is None:
        exclude_names = set()
    else:
        exclude_names = set(exclude_names)

    if exclude_types is None:
        exclude_types = ()
    else:
        exclude_types = tuple(exclude_types)

    if isinstance(param_names, str):
        param_names = [param_names]

    for name, module in model.named_modules():
        if name in exclude_names:
            continue
        if isinstance(module, exclude_types):
            continue
        if not isinstance(module, tuple(include_types)):
            continue
        if predicate is not None and not predicate(name, module):
            continue

        has_param = any(hasattr(module, pn) for pn in param_names)
        if not has_param:
            continue

        spectral_norm(
            module,
            param_names=param_names,
            n_power_iterations=n_power_iterations,
            eps=eps,
            power_iter_on_eval=power_iter_on_eval,
            stable_fp32=stable_fp32,
            init_on_first_forward=init_on_first_forward,
        )

    return model


def remove_spectral_norm_recursive(
    model: nn.Module,
    param_names: Union[str, Sequence[str], None] = None,
) -> nn.Module:
    for module in model.modules():
        if hasattr(module, "_spectral_norm_wrappers"):
            remove_spectral_norm(module, param_names)
    return model


class SNResBlock(nn.Module):
    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        downsample: bool = False,
        first_block: bool = False,
    ) -> None:
        super().__init__()
        self.downsample = downsample
        self.first_block = first_block
        self.in_channels = in_channels
        self.out_channels = out_channels

        self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1)
        self.relu = nn.ReLU(inplace=True)

        self.skip = None
        if in_channels != out_channels or downsample:
            self.skip = nn.Conv2d(in_channels, out_channels, kernel_size=1)

        self.pool = nn.AvgPool2d(2) if downsample else None

    def forward(self, x: Tensor) -> Tensor:
        if self.first_block:
            h = x
        else:
            h = self.relu(x)

        h = self.conv1(h)
        h = self.relu(h)
        h = self.conv2(h)

        if self.pool is not None:
            h = self.pool(h)

        if self.skip is not None:
            if self.downsample:
                skip = self.skip(x)
                skip = self.pool(skip) if self.pool else skip
            else:
                skip = self.skip(x)
        else:
            skip = x
            if self.downsample:
                skip = self.pool(skip) if self.pool else skip

        return h + skip


class SNResNetDiscriminator(nn.Module):
    def __init__(
        self,
        in_channels: int = 3,
        base_channels: int = 64,
        num_blocks: int = 4,
        num_classes: int = 1,
        apply_sn: bool = True,
        n_power_iterations: int = 1,
    ) -> None:
        super().__init__()

        self.in_channels = in_channels
        self.base_channels = base_channels
        self.num_blocks = num_blocks
        self.num_classes = num_classes

        blocks = []
        current_channels = in_channels

        for i in range(num_blocks):
            out_channels = base_channels * (2 ** min(i, 3))
            downsample = True
            first_block = (i == 0)

            block = SNResBlock(
                in_channels=current_channels,
                out_channels=out_channels,
                downsample=downsample,
                first_block=first_block,
            )
            blocks.append(block)
            current_channels = out_channels

        self.blocks = nn.ModuleList(blocks)
        self.final_relu = nn.ReLU(inplace=True)
        self.linear = nn.Linear(current_channels, num_classes)

        if apply_sn:
            apply_spectral_norm(
                self,
                n_power_iterations=n_power_iterations,
                include_types=(nn.Conv2d, nn.Linear),
            )

    def forward(self, x: Tensor) -> Tensor:
        h = x
        for block in self.blocks:
            h = block(h)

        h = self.final_relu(h)
        h = h.sum(dim=[2, 3])
        out = self.linear(h)
        return out


def create_sn_discriminator(
    in_channels: int = 3,
    base_channels: int = 64,
    num_blocks: int = 4,
    num_classes: int = 1,
    n_power_iterations: int = 1,
) -> SNResNetDiscriminator:
    return SNResNetDiscriminator(
        in_channels=in_channels,
        base_channels=base_channels,
        num_blocks=num_blocks,
        num_classes=num_classes,
        apply_sn=True,
        n_power_iterations=n_power_iterations,
    )


def get_spectral_norm_modules(model: nn.Module) -> List[Tuple[str, nn.Module]]:
    sn_modules = []
    for name, module in model.named_modules():
        if hasattr(module, "_spectral_norm_wrappers"):
            sn_modules.append((name, module))
        elif hasattr(module, "parametrizations"):
            for param_name in module.parametrizations:
                for p in module.parametrizations[param_name]:
                    if isinstance(p, SpectralNormParametrization):
                        sn_modules.append((name, module))
                        break
    return sn_modules


def get_spectral_norm_stats(module: nn.Module, param_name: str = "weight") -> Optional[dict]:
    if not hasattr(module, "parametrizations"):
        return None

    if param_name not in module.parametrizations:
        return None

    for p in module.parametrizations[param_name]:
        if isinstance(p, SpectralNormParametrization):
            weight = getattr(module, param_name)
            weight_matrix = _reshape_weight_to_matrix(weight, p.is_conv_transpose)
            sigma = p._compute_sigma(weight_matrix, p._u, p._v)

            return {
                "u": p._u.clone(),
                "v": p._v.clone(),
                "sigma": sigma.item(),
                "n_power_iterations": p.n_power_iterations,
                "eps": p.eps,
            }

    return None


if __name__ == "__main__":
    print("=== Spectral Normalization Demo ===\n")

    print("1. Applying SN to Linear layer:")
    linear = nn.Linear(10, 5)
    print(f"   Before: weight norm = {linear.weight.norm().item():.4f}")
    linear = spectral_norm(linear)
    x = torch.randn(2, 10)
    _ = linear(x)
    stats = get_spectral_norm_stats(linear)
    if stats:
        print(f"   Estimated sigma = {stats['sigma']:.4f}")

    print("\n2. Applying SN to Conv2d layer:")
    conv = nn.Conv2d(3, 16, kernel_size=3, padding=1)
    conv = spectral_norm(conv)
    x = torch.randn(1, 3, 32, 32)
    _ = conv(x)
    stats = get_spectral_norm_stats(conv)
    if stats:
        print(f"   Conv2d sigma = {stats['sigma']:.4f}")

    print("\n3. Creating SN-ResNet Discriminator:")
    disc = create_sn_discriminator(in_channels=3, num_blocks=3, base_channels=32)
    fake_imgs = torch.randn(4, 3, 64, 64)
    logits = disc(fake_imgs)
    print(f"   Input shape: {fake_imgs.shape}")
    print(f"   Output shape: {logits.shape}")

    sn_mods = get_spectral_norm_modules(disc)
    print(f"   Number of SN modules: {len(sn_mods)}")

    print("\n4. Removing SN from linear layer:")
    linear2 = spectral_norm(nn.Linear(5, 3))
    _ = linear2(torch.randn(1, 5))
    print(f"   Has SN: {hasattr(linear2, 'parametrizations')}")
    linear2 = remove_spectral_norm(linear2)
    print(f"   After removal: {not (hasattr(linear2, 'parametrizations') and len(linear2.parametrizations) > 0)}")

    print("\n=== Demo Complete ===")

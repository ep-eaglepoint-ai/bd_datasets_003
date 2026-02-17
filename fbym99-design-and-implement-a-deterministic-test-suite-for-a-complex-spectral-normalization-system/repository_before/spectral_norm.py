import math
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple, Type

import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    from torch.nn.parameter import UninitializedParameter
except Exception:
    UninitializedParameter = None


def _is_uninitialized_param(p: torch.Tensor) -> bool:
    if UninitializedParameter is None:
        return False
    return isinstance(p, UninitializedParameter)


def _as_float32(x: torch.Tensor) -> torch.Tensor:
    if x.dtype in (torch.float16, torch.bfloat16):
        return x.float()
    return x


def _l2_normalize(x: torch.Tensor, eps: float) -> torch.Tensor:
    return x / (x.norm(p=2) + eps)


def _reshape_weight_to_matrix(module: nn.Module, w: torch.Tensor) -> torch.Tensor:
    if w.dim() == 2:
        return w
    if isinstance(module, (nn.ConvTranspose1d, nn.ConvTranspose2d, nn.ConvTranspose3d)):
        if w.dim() >= 2:
            w = w.transpose(0, 1)
    return w.reshape(w.size(0), -1)


def _safe_detach(x: torch.Tensor) -> torch.Tensor:
    return x.detach()


def _maybe_cast(x: torch.Tensor, dtype: torch.dtype, device: torch.device) -> torch.Tensor:
    if x.dtype != dtype or x.device != device:
        return x.to(dtype=dtype, device=device)
    return x


@dataclass(frozen=True)
class SNConfig:
    param_name: str = "weight"
    n_power_iterations: int = 1
    eps: float = 1e-12
    stable_fp32: bool = True
    mode: str = "power_iter"
    exact_svd_max_dim: int = 256
    ema_decay: float = 0.0
    update_every: int = 1
    warmup_steps: int = 0
    cache_weight: bool = True
    strict_shape_checks: bool = False
    allow_nonfinite: bool = False
    trace: bool = False


class SNTraceBuffer:
    def __init__(self, enabled: bool = False, maxlen: int = 128):
        self.enabled = enabled
        self.maxlen = maxlen
        self.events: List[Dict[str, Any]] = []

    def emit(self, **evt: Any) -> None:
        if not self.enabled:
            return
        self.events.append(evt)
        if len(self.events) > self.maxlen:
            self.events.pop(0)


class SpectralNormParamV2(nn.Module):
    def __init__(
        self,
        module: nn.Module,
        cfg: SNConfig,
        pre_hook: Optional[Callable[[nn.Module, str], None]] = None,
        post_hook: Optional[Callable[[nn.Module, str, torch.Tensor], None]] = None,
    ):
        super().__init__()
        if not hasattr(module, cfg.param_name):
            raise ValueError(f"Module has no attribute '{cfg.param_name}'")
        if cfg.n_power_iterations < 0:
            raise ValueError("n_power_iterations must be >= 0")
        if cfg.update_every < 1:
            raise ValueError("update_every must be >= 1")
        if not (0.0 <= cfg.ema_decay < 1.0):
            raise ValueError("ema_decay must be in [0, 1)")

        self.module = module
        self.cfg = cfg
        self.pre_hook = pre_hook
        self.post_hook = post_hook

        self.trace = SNTraceBuffer(enabled=cfg.trace)

        self.register_buffer("_step", torch.zeros((), dtype=torch.long))
        self.register_buffer("_cache_valid", torch.zeros((), dtype=torch.uint8))
        self._cached_w_sn: Optional[torch.Tensor] = None

        self.register_buffer("_sigma_ema", torch.zeros((), dtype=torch.float32))

        self._initialized = False
        self._setup_if_possible()

    def _get_param(self) -> torch.Tensor:
        return getattr(self.module, self.cfg.param_name)

    def _set_param(self, value: torch.Tensor) -> None:
        setattr(self.module, self.cfg.param_name, value)

    def _get_orig(self) -> torch.Tensor:
        return getattr(self.module, f"{self.cfg.param_name}_orig")

    def _setup_if_possible(self) -> None:
        p = self._get_param()
        if isinstance(p, nn.Parameter):
            if _is_uninitialized_param(p):
                return
        else:
            return
        self._make_params()
        self._initialized = True

    def _make_params(self) -> None:
        p = self._get_param()
        if not isinstance(p, nn.Parameter):
            raise TypeError(f"{self.cfg.param_name} must be an nn.Parameter")

        orig_name = f"{self.cfg.param_name}_orig"
        if hasattr(self.module, orig_name):
            self._initialized = True
            return

        self.module.register_parameter(orig_name, nn.Parameter(p.data))
        del self.module._parameters[self.cfg.param_name]
        self.module.register_buffer(self.cfg.param_name, p.data)

        w_mat = _reshape_weight_to_matrix(self.module, self._get_orig()).detach()
        w_ref = _as_float32(w_mat) if self.cfg.stable_fp32 else w_mat
        out_dim, in_dim = w_ref.shape

        u = _l2_normalize(torch.randn(out_dim, device=w_ref.device, dtype=w_ref.dtype), self.cfg.eps)
        v = _l2_normalize(torch.randn(in_dim, device=w_ref.device, dtype=w_ref.dtype), self.cfg.eps)

        self.register_buffer("u", u)
        self.register_buffer("v", v)

        with torch.no_grad():
            sigma0 = torch.abs(torch.dot(u, torch.mv(w_ref, v)))
            self._sigma_ema.copy_(sigma0.float().clamp_min(self.cfg.eps))

    def _ensure_uv_device_dtype(self, ref: torch.Tensor) -> None:
        if not hasattr(self, "u") or not hasattr(self, "v"):
            return
        if self.u.device != ref.device or self.u.dtype != ref.dtype:
            self.u = self.u.to(device=ref.device, dtype=ref.dtype)
        if self.v.device != ref.device or self.v.dtype != ref.dtype:
            self.v = self.v.to(device=ref.device, dtype=ref.dtype)

    @torch.no_grad()
    def _power_iteration(self, w_mat: torch.Tensor) -> torch.Tensor:
        u = self.u
        v = self.v
        for _ in range(self.cfg.n_power_iterations):
            v = _l2_normalize(torch.mv(w_mat.t(), u), self.cfg.eps)
            u = _l2_normalize(torch.mv(w_mat, v), self.cfg.eps)
        self.u.copy_(u)
        self.v.copy_(v)
        return torch.dot(u, torch.mv(w_mat, v))

    def _sigma_rayleigh(self, w_mat: torch.Tensor) -> torch.Tensor:
        u = self.u
        v = self.v
        return torch.abs(torch.dot(u, torch.mv(w_mat, v)))

    def _sigma_exact_svd_if_small(self, w_mat: torch.Tensor) -> Optional[torch.Tensor]:
        if w_mat.size(0) <= self.cfg.exact_svd_max_dim and w_mat.size(1) <= self.cfg.exact_svd_max_dim:
            s = torch.linalg.svdvals(w_mat)
            return s.max()
        return None

    def _should_update(self) -> bool:
        step = int(self._step.item())
        if step < self.cfg.warmup_steps:
            return True
        return (step % self.cfg.update_every) == 0

    def _validate_sigma(self, sigma: torch.Tensor) -> None:
        if self.cfg.allow_nonfinite:
            return
        if not torch.isfinite(sigma).all():
            raise FloatingPointError(f"Non-finite sigma for {self.cfg.param_name}: {sigma}")

    def compute_weight(self) -> torch.Tensor:
        if not self._initialized:
            self._setup_if_possible()
            if not self._initialized:
                return self._get_param()

        if self.pre_hook is not None:
            self.pre_hook(self.module, self.cfg.param_name)

        w_orig = self._get_orig()
        w_mat = _reshape_weight_to_matrix(self.module, w_orig)
        if self.cfg.strict_shape_checks and w_mat.dim() != 2:
            raise RuntimeError("Expected reshaped weight matrix to be 2D")

        w_ref = _as_float32(w_mat) if self.cfg.stable_fp32 else w_mat
        self._ensure_uv_device_dtype(w_ref)

        update = self._should_update()
        step = int(self._step.item())

        if self.cfg.cache_weight and (not update) and (int(self._cache_valid.item()) == 1) and (self._cached_w_sn is not None):
            w_sn = _maybe_cast(self._cached_w_sn, w_orig.dtype, w_orig.device)
            if self.post_hook is not None:
                self.post_hook(self.module, self.cfg.param_name, w_sn)
            self._step.add_(1)
            return w_sn

        sigma_exact = None
        if self.cfg.mode == "exact_svd":
            sigma_exact = self._sigma_exact_svd_if_small(w_ref)

        if sigma_exact is not None:
            sigma = sigma_exact
        else:
            if self.cfg.mode == "rayleigh":
                sigma = self._sigma_rayleigh(w_ref)
            else:
                if update and self.cfg.n_power_iterations > 0:
                    sigma = self._power_iteration(w_ref)
                else:
                    sigma = torch.dot(self.u, torch.mv(w_ref, self.v))

        sigma = torch.abs(sigma)
        self._validate_sigma(sigma)

        if self.cfg.ema_decay > 0.0:
            with torch.no_grad():
                ema = self._sigma_ema
                ema.mul_(self.cfg.ema_decay).add_((1.0 - self.cfg.ema_decay) * sigma.float())
                sigma_eff = ema.to(dtype=w_ref.dtype, device=w_ref.device)
        else:
            sigma_eff = sigma

        sigma_eff = sigma_eff.to(dtype=w_orig.dtype, device=w_orig.device)
        w_sn = w_orig / (sigma_eff + self.cfg.eps)

        if self.cfg.cache_weight:
            self._cached_w_sn = w_sn.detach()
            self._cache_valid.fill_(1)
        else:
            self._cached_w_sn = None
            self._cache_valid.fill_(0)

        if self.post_hook is not None:
            self.post_hook(self.module, self.cfg.param_name, w_sn)

        self._step.add_(1)
        return w_sn

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        w_sn = self.compute_weight()
        self._set_param(w_sn)
        return self.module(x)


class SpectralNormMultiV2(nn.Module):
    def __init__(
        self,
        module: nn.Module,
        configs: Sequence[SNConfig],
        pre_hook: Optional[Callable[[nn.Module, str], None]] = None,
        post_hook: Optional[Callable[[nn.Module, str, torch.Tensor], None]] = None,
    ):
        super().__init__()
        self.module = module
        self.configs = tuple(configs)
        self.sn_params = nn.ModuleList(
            [SpectralNormParamV2(module, cfg, pre_hook=pre_hook, post_hook=post_hook) for cfg in self.configs]
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for snp in self.sn_params:
            w_sn = snp.compute_weight()
            setattr(self.module, snp.cfg.param_name, w_sn)
        return self.module(x)


def apply_spectral_norm_v2(
    model: nn.Module,
    configs_by_type: Optional[Dict[Type[nn.Module], Sequence[SNConfig]]] = None,
    include_types: Tuple[Type[nn.Module], ...] = (
        nn.Linear,
        nn.Conv1d, nn.Conv2d, nn.Conv3d,
        nn.ConvTranspose1d, nn.ConvTranspose2d, nn.ConvTranspose3d,
        nn.LazyLinear,
        nn.LazyConv1d, nn.LazyConv2d, nn.LazyConv3d,
        nn.LazyConvTranspose1d, nn.LazyConvTranspose2d, nn.LazyConvTranspose3d,
    ),
    exclude_names: Optional[Iterable[str]] = None,
    exclude_types: Tuple[Type[nn.Module], ...] = (),
    predicate: Optional[Callable[[str, nn.Module], bool]] = None,
    default_config: Optional[SNConfig] = None,
    pre_hook: Optional[Callable[[nn.Module, str], None]] = None,
    post_hook: Optional[Callable[[nn.Module, str, torch.Tensor], None]] = None,
) -> nn.Module:
    exclude_names_set = set(exclude_names or [])
    default_config = default_config or SNConfig()

    for name, child in list(model.named_children()):
        apply_spectral_norm_v2(
            child,
            configs_by_type=configs_by_type,
            include_types=include_types,
            exclude_names=exclude_names_set,
            exclude_types=exclude_types,
            predicate=predicate,
            default_config=default_config,
            pre_hook=pre_hook,
            post_hook=post_hook,
        )

        if name in exclude_names_set:
            continue
        if exclude_types and isinstance(child, exclude_types):
            continue
        if predicate is not None and not predicate(name, child):
            continue
        if not isinstance(child, include_types):
            continue

        cfgs = None
        if configs_by_type is not None:
            for t, cseq in configs_by_type.items():
                if isinstance(child, t):
                    cfgs = cseq
                    break
        if cfgs is None:
            cfgs = (default_config,)

        cfgs = tuple(cfg for cfg in cfgs if hasattr(child, cfg.param_name))
        if not cfgs:
            continue

        wrapped = SpectralNormMultiV2(child, configs=cfgs, pre_hook=pre_hook, post_hook=post_hook)
        setattr(model, name, wrapped)

    return model


def remove_spectral_norm_v2(model: nn.Module) -> nn.Module:
    for name, child in list(model.named_children()):
        remove_spectral_norm_v2(child)
        if isinstance(child, SpectralNormMultiV2):
            inner = child.module
            for cfg in child.configs:
                pn = cfg.param_name
                orig_name = f"{pn}_orig"
                if hasattr(inner, orig_name):
                    w_orig = getattr(inner, orig_name)
                    if isinstance(w_orig, nn.Parameter):
                        if pn in inner._buffers:
                            del inner._buffers[pn]
                        inner.register_parameter(pn, nn.Parameter(w_orig.data))
                        del inner._parameters[orig_name]
            setattr(model, name, inner)
    return model


class SNResBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, downsample: bool):
        super().__init__()
        self.downsample = downsample
        self.learned_skip = (in_ch != out_ch) or downsample
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, padding=1)
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1)
        self.skip = nn.Conv2d(in_ch, out_ch, 1) if self.learned_skip else None

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.relu(x, inplace=False)
        h = self.conv1(h)
        h = F.relu(h, inplace=False)
        h = self.conv2(h)
        if self.downsample:
            h = F.avg_pool2d(h, 2)
        if self.learned_skip:
            x_skip = F.avg_pool2d(x, 2) if self.downsample else x
            x_skip = self.skip(x_skip)
        else:
            x_skip = x
        return h + x_skip


class SNResNetDiscriminator(nn.Module):
    def __init__(self, in_channels: int = 3, base_channels: int = 64, blocks: int = 4):
        super().__init__()
        self.conv_in = nn.Conv2d(in_channels, base_channels, 3, padding=1)

        ch = base_channels
        layers: List[nn.Module] = []
        for i in range(blocks):
            out_ch = ch * 2 if i < blocks - 1 else ch
            layers.append(SNResBlock(ch, out_ch, True))
            ch = out_ch
        self.blocks = nn.Sequential(*layers)
        self.fc = nn.Linear(ch, 1)

        configs_by_type = {
            nn.Conv2d: (
                SNConfig(param_name="weight", mode="power_iter", n_power_iterations=1,
                         ema_decay=0.1, update_every=2, warmup_steps=2, cache_weight=True, trace=False),
            ),
            nn.Linear: (
                SNConfig(param_name="weight", mode="exact_svd", exact_svd_max_dim=512,
                         ema_decay=0.0, update_every=1, cache_weight=False, trace=False),
            ),
        }

        apply_spectral_norm_v2(
            self,
            configs_by_type=configs_by_type,
            default_config=SNConfig(param_name="weight", mode="rayleigh", ema_decay=0.2, update_every=3),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.conv_in(x)
        h = self.blocks(h)
        h = F.relu(h, inplace=False)
        h = h.sum(dim=(2, 3))
        return self.fc(h)

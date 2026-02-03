import torch
from torch import nn
from torch.optim import SGD, Adam
from torch.optim.lr_scheduler import _LRScheduler
import pytorch_lightning as pl
from typing import Optional, Type, Union, Dict

class SAM(torch.optim.Optimizer):
    def __init__(self, params, base_optimizer: Type[torch.optim.Optimizer], rho=0.05, adaptive=False, **kwargs):
        if rho < 0.0:
            raise ValueError(f"Invalid rho value: {rho}")
        self.rho = rho
        self.adaptive = adaptive
        self.base_optimizer = base_optimizer(params, **kwargs)
        self.param_groups = self.base_optimizer.param_groups

    @torch.no_grad()
    def first_step(self, zero_grad=False):
        grad_norm = self._grad_norm()
        scale = self.rho / (grad_norm + 1e-12)
        for group in self.param_groups:
            for p in group['params']:
                if p.grad is None:
                    continue
                self.state.setdefault(p, {})
                self.state[p]['old_p'] = p.data.clone()
                eps = (p.abs() + 1e-12) * p.grad * scale if self.adaptive else p.grad * scale
                p.add_(eps)
                self.state[p]['eps'] = eps
        if zero_grad:
            self.zero_grad()

    @torch.no_grad()
    def second_step(self, zero_grad=False):
        for group in self.param_groups:
            for p in group['params']:
                if p.grad is None:
                    continue
                if p in self.state and 'old_p' in self.state[p]:
                    p.data = self.state[p]['old_p']
        self.base_optimizer.step()
        if zero_grad:
            self.zero_grad()

    def zero_grad(self):
        self.base_optimizer.zero_grad()

    def _grad_norm(self):
        norm = torch.norm(
            torch.stack([
                p.grad.norm(p=2) if not p.grad.is_sparse else p.grad.coalesce().values().norm(p=2)
                for group in self.param_groups for p in group['params'] if p.grad is not None
            ]),
            p=2
        )
        return norm

class LitModelSAM(pl.LightningModule):
    def __init__(
        self,
        model: nn.Module,
        loss_fn: nn.Module,
        base_optimizer: Type[torch.optim.Optimizer] = Adam,
        lr: float = 1e-3,
        rho: float = 0.05,
        adaptive: bool = False,
        scheduler: Optional[Union[_LRScheduler, Dict]] = None,
        max_grad_norm: Optional[float] = None
    ):
        super().__init__()
        self.model = model
        self.loss_fn = loss_fn
        self.save_hyperparameters()
        self.base_optimizer = base_optimizer
        self.lr = lr
        self.rho = rho
        self.adaptive = adaptive
        self.scheduler = scheduler
        self.max_grad_norm = max_grad_norm

    def forward(self, x):
        return self.model(x)

    def training_step(self, batch, batch_idx):
        x, y = batch
        preds = self(x)
        loss = self.loss_fn(preds, y)
        self.manual_backward(loss)
        if self.max_grad_norm is not None:
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.max_grad_norm)
        self.optimizer.first_step(zero_grad=True)
        preds = self(x)
        loss_2 = self.loss_fn(preds, y)
        self.manual_backward(loss_2)
        if self.max_grad_norm is not None:
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.max_grad_norm)
        self.optimizer.second_step(zero_grad=True)
        self.log('train_loss', loss, prog_bar=True)
        return loss

    def configure_optimizers(self):
        self.optimizer = SAM(
            self.model.parameters(),
            base_optimizer=self.base_optimizer,
            rho=self.rho,
            adaptive=self.adaptive,
            lr=self.lr
        )
        if self.scheduler is None:
            return self.optimizer
        if isinstance(self.scheduler, dict):
            return {
                'optimizer': self.optimizer,
                'lr_scheduler': self.scheduler['scheduler'],
                'monitor': self.scheduler.get('monitor', None),
            }
        else:
            return [self.optimizer], [self.scheduler]

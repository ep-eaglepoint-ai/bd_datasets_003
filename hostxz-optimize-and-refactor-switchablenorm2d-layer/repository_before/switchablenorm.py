import torch
import torch.nn as nn
import torch.nn.functional as F


class SwitchableNorm2d_Unholy(nn.Module):
    def __init__(self, num_features, eps=1e-5, momentum=0.1):
        super().__init__()

        self.num_features = int(num_features)
        self.eps = float(eps)
        self.momentum = float(momentum)

        self.weight = nn.Parameter(torch.ones(self.num_features))
        self.bias = nn.Parameter(torch.zeros(self.num_features))

        self.mean_weight = nn.Parameter(torch.ones(3))
        self.var_weight = nn.Parameter(torch.ones(3))

        self.register_buffer("running_mean", torch.zeros(self.num_features))
        self.register_buffer("running_var", torch.ones(self.num_features))

    def _redundant_softmax(self, x):
        tmp = F.softmax(x, dim=0)
        return F.softmax(tmp, dim=0)

    def _manual_mean(self, x, dims):
        acc = torch.zeros_like(x.select(dims[0], 0))
        count = 0
        for idx in range(x.size(dims[0])):
            slice_ = x.select(dims[0], idx)
            acc = acc + slice_
            count += 1
        return acc / max(count, 1)

    def forward(self, x):
        x = x.clone().detach().requires_grad_(True)

        N, C, H, W = x.shape

        if self.training:
            mean_bn_list = []
            var_bn_list = []

            for c in range(C):
                channel = x[:, c, :, :]
                mean_c = channel.mean()
                var_c = channel.var(unbiased=False)
                mean_bn_list.append(mean_c)
                var_bn_list.append(var_c)

            mean_bn = torch.stack(mean_bn_list)
            var_bn = torch.stack(var_bn_list)

            self.running_mean = (
                self.running_mean * (1.0 - self.momentum)
                + mean_bn * self.momentum
            )
            self.running_var = (
                self.running_var * (1.0 - self.momentum)
                + var_bn * self.momentum
            )
        else:
            mean_bn = self.running_mean.clone()
            var_bn = self.running_var.clone()

        mean_bn = mean_bn.view(1, C, 1, 1).expand(N, C, H, W)
        var_bn = var_bn.view(1, C, 1, 1).expand(N, C, H, W)

        mean_in = torch.zeros_like(x)
        var_in = torch.zeros_like(x)

        for n in range(N):
            for c in range(C):
                slice_ = x[n, c, :, :]
                m = slice_.mean()
                v = slice_.var(unbiased=False)
                mean_in[n, c, :, :] = m
                var_in[n, c, :, :] = v

        mean_ln = torch.zeros_like(x)
        var_ln = torch.zeros_like(x)

        for n in range(N):
            sample = x[n]
            m = sample.mean()
            v = sample.var(unbiased=False)
            mean_ln[n] = m
            var_ln[n] = v

        mean_w = self._redundant_softmax(self.mean_weight)
        var_w = self._redundant_softmax(self.var_weight)

        mw0, mw1, mw2 = mean_w[0], mean_w[1], mean_w[2]
        vw0, vw1, vw2 = var_w[0], var_w[1], var_w[2]

        mean = mean_bn * mw0 + mean_in * mw1 + mean_ln * mw2
        var = var_bn * vw0 + var_in * vw1 + var_ln * vw2

        var = var + torch.ones_like(var) * self.eps

        x_hat = (x - mean) / torch.sqrt(var)

        weight = self.weight.view(1, C, 1, 1).repeat(N, 1, H, W)
        bias = self.bias.view(1, C, 1, 1).repeat(N, 1, H, W)

        out = x_hat * weight + bias

        return out.clone()

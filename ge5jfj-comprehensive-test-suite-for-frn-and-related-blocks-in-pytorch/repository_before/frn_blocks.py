import torch
import torch.nn as nn
import torch.nn.functional as F

class FRN(nn.Module):
    def __init__(self, num_channels, eps=1e-6):
        super().__init__()
        self.eps = eps
        self.gamma = nn.Parameter(torch.ones(1, num_channels, 1, 1))
        self.beta = nn.Parameter(torch.zeros(1, num_channels, 1, 1))
        self.tau = nn.Parameter(torch.zeros(1, num_channels, 1, 1))

    def forward(self, x):
        nu2 = torch.mean(x * x, dim=(2, 3), keepdim=True)
        x = x / torch.sqrt(nu2 + self.eps)
        x = self.gamma * x + self.beta
        return torch.maximum(x, self.tau)

class FRN_ONNX(nn.Module):
    def __init__(self, num_channels, eps=1e-6):
        super().__init__()
        self.eps = eps
        self.gamma = nn.Parameter(torch.ones(1, num_channels, 1, 1))
        self.beta = nn.Parameter(torch.zeros(1, num_channels, 1, 1))
        self.tau = nn.Parameter(torch.zeros(1, num_channels, 1, 1))

    def forward(self, x):
        nu2 = torch.mean(x * x, dim=(2, 3), keepdim=True)
        x = x / torch.sqrt(nu2 + self.eps)
        x = self.gamma * x + self.beta
        return torch.maximum(x, self.tau)

class ConvFRNBlock(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size=3, stride=1, padding=1):
        super().__init__()
        self.conv = nn.Conv2d(in_ch, out_ch, kernel_size=kernel_size, stride=stride, padding=padding, bias=False)
        self.frn = FRN(out_ch)

    def forward(self, x):
        return self.frn(self.conv(x))

class ResBlockFRN(nn.Module):
    def __init__(self, channels):
        super().__init__()
        self.block = nn.Sequential(
            ConvFRNBlock(channels, channels),
            ConvFRNBlock(channels, channels),
        )

    def forward(self, x):
        return x + self.block(x)

class DepthwiseSeparableFRN(nn.Module):
    def __init__(self, in_ch, out_ch, stride=1):
        super().__init__()
        self.depthwise = nn.Conv2d(in_ch, in_ch, kernel_size=3, stride=stride, padding=1, groups=in_ch, bias=False)
        self.frn_dw = FRN(in_ch)
        self.pointwise = nn.Conv2d(in_ch, out_ch, kernel_size=1, bias=False)
        self.frn_pw = FRN(out_ch)

    def forward(self, x):
        x = self.frn_dw(self.depthwise(x))
        x = self.frn_pw(self.pointwise(x))
        return x

def fuse_conv_frn(conv: nn.Conv2d, frn: FRN):
    fused_conv = nn.Conv2d(conv.in_channels, conv.out_channels, conv.kernel_size, conv.stride, conv.padding, bias=True)
    gamma = frn.gamma.view(-1, 1, 1, 1)
    fused_weight = conv.weight * gamma
    fused_bias = frn.beta.view(-1)
    fused_conv.weight.data.copy_(fused_weight)
    fused_conv.bias.data.copy_(fused_bias)
    return fused_conv, frn.tau

def grad_norm(module):
    total = 0.0
    for p in module.parameters():
        if p.grad is not None:
            total += p.grad.norm().item()
    return total

def compare_gradients():
    x = torch.randn(2, 64, 32, 32, requires_grad=True)
    bn = nn.BatchNorm2d(64)
    frn = FRN(64)
    y_bn = bn(x).mean()
    y_frn = frn(x).mean()
    y_bn.backward(retain_graph=True)
    y_frn.backward()
    print("BatchNorm grad norm:", grad_norm(bn))
    print("FRN grad norm:", grad_norm(frn))

if __name__ == "__main__":
    x = torch.randn(1, 64, 224, 224)
    block = ConvFRNBlock(64, 64)
    y = block(x)
    print("ConvFRN output:", y.shape)
    res = ResBlockFRN(64)
    y = res(x)
    print("ResBlockFRN output:", y.shape)
    mobile = DepthwiseSeparableFRN(64, 128)
    y = mobile(x)
    print("MobileFRN output:", y.shape)
    compare_gradients()

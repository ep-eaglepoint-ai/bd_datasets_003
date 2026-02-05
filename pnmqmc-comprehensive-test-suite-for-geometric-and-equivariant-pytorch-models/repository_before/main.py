import math
import torch
import torch.nn as nn
import torch.nn.functional as F

class CyclicGroup:
    def __init__(self, N):
        self.N = N
        self.elements = list(range(N))

    def transform_grid(self, grid, k):
        theta = 2 * math.pi * k / self.N
        rot = torch.tensor([[math.cos(theta), -math.sin(theta), 0],[math.sin(theta), math.cos(theta), 0]], device=grid.device, dtype=grid.dtype)
        return F.affine_grid(rot.unsqueeze(0), grid.size(), align_corners=False)

class SteerableKernel(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size, group_order):
        super().__init__()
        self.base_weight = nn.Parameter(torch.randn(out_ch, in_ch, kernel_size, kernel_size))
        self.group_order = group_order
        self.ks = kernel_size

    def rotated(self, k):
        theta = 2 * math.pi * k / self.group_order
        rot = torch.tensor([[math.cos(theta), -math.sin(theta), 0],[math.sin(theta), math.cos(theta), 0]], dtype=self.base_weight.dtype, device=self.base_weight.device)
        grid = F.affine_grid(rot.unsqueeze(0), self.base_weight.unsqueeze(0).size(), align_corners=False)
        return F.grid_sample(self.base_weight.unsqueeze(0), grid, align_corners=False).squeeze(0)

    def forward(self):
        return torch.cat([self.rotated(k) for k in range(self.group_order)], dim=0)

class GroupConv2D(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size, group_order, padding=1):
        super().__init__()
        self.kernel = SteerableKernel(in_ch, out_ch, kernel_size, group_order)
        self.padding = padding
        self.group_order = group_order

    def forward(self, x):
        weight = self.kernel()
        return F.conv2d(x, weight, padding=self.padding)

class GroupToGroupConv(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size, group_order, padding=1):
        super().__init__()
        self.group_order = group_order
        self.weight = nn.Parameter(torch.randn(out_ch, in_ch, group_order, kernel_size, kernel_size))
        self.padding = padding

    def forward(self, x):
        B, Cg, H, W = x.shape
        x = x.view(B, -1, self.group_order, H, W)
        outputs = []
        for g in range(self.group_order):
            acc = 0
            for h in range(self.group_order):
                acc = acc + F.conv2d(x[:, :, h], self.weight[:, :, (g - h) % self.group_order], padding=self.padding)
            outputs.append(acc)
        return torch.cat(outputs, dim=1)

class GroupReLU(nn.Module):
    def __init__(self, group_order):
        super().__init__()
        self.group_order = group_order

    def forward(self, x):
        B, C, H, W = x.shape
        x = x.view(B, -1, self.group_order, H, W)
        x = F.relu(x)
        return x.view(B, C, H, W)

class GroupPooling(nn.Module):
    def __init__(self, group_order, mode="mean"):
        super().__init__()
        self.group_order = group_order
        self.mode = mode

    def forward(self, x):
        B, C, H, W = x.shape
        x = x.view(B, -1, self.group_order, H, W)
        if self.mode == "max":
            x, _ = x.max(dim=2)
        else:
            x = x.mean(dim=2)
        return x

class GCNN(nn.Module):
    def __init__(self, group_order=8, num_classes=10):
        super().__init__()
        self.gconv1 = GroupConv2D(1, 16, 3, group_order)
        self.relu1 = GroupReLU(group_order)
        self.gconv2 = GroupToGroupConv(16, 32, 3, group_order)
        self.relu2 = GroupReLU(group_order)
        self.pool = GroupPooling(group_order)
        self.fc = nn.Linear(32 * 28 * 28, num_classes)

    def forward(self, x):
        x = self.gconv1(x)
        x = self.relu1(x)
        x = self.gconv2(x)
        x = self.relu2(x)
        x = self.pool(x)
        x = torch.flatten(x, 1)
        return self.fc(x)

class SE2SteerableConv(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size, max_freq=4):
        super().__init__()
        self.in_ch = in_ch
        self.out_ch = out_ch
        self.kernel_size = kernel_size
        self.max_freq = max_freq
        self.coeffs = nn.Parameter(torch.randn(out_ch, in_ch, max_freq))

    def forward(self, x, theta):
        grid_y, grid_x = torch.meshgrid(torch.linspace(-1, 1, self.kernel_size, device=x.device), torch.linspace(-1, 1, self.kernel_size, device=x.device), indexing='ij')
        phi = torch.atan2(grid_y, grid_x)
        kernel = 0
        for m in range(self.max_freq):
            kernel = kernel + self.coeffs[:, :, m].unsqueeze(-1).unsqueeze(-1) * torch.cos(m * (phi - theta))
        kernel = kernel.view(self.out_ch, self.in_ch, self.kernel_size, self.kernel_size)
        return F.conv2d(x, kernel, padding=self.kernel_size // 2)

class ManifoldMessagePassing(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.phi = nn.Linear(in_ch, out_ch, bias=False)
        self.psi = nn.Linear(in_ch, out_ch, bias=False)

    def forward(self, x, edge_index, edge_attr):
        src, dst = edge_index
        msg = self.phi(x[src]) * edge_attr.norm(dim=1, keepdim=True)
        agg = torch.zeros_like(self.psi(x))
        agg.index_add_(0, dst, msg)
        return self.psi(x) + agg

class SE2GraphNet(nn.Module):
    def __init__(self, in_ch, hidden_ch, out_ch, layers=3):
        super().__init__()
        self.layers = nn.ModuleList([ManifoldMessagePassing(in_ch if i == 0 else hidden_ch, hidden_ch) for i in range(layers)])
        self.readout = nn.Linear(hidden_ch, out_ch)

    def forward(self, x, edge_index, edge_attr):
        for layer in self.layers:
            x = layer(x, edge_index, edge_attr)
        return self.readout(x)

class IrrepField(nn.Module):
    def __init__(self, irreps):
        super().__init__()
        self.irreps = irreps

    def forward(self, x):
        return x

class GaugeEquivariantLayer(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.kernel = nn.Linear(in_ch, out_ch, bias=False)

    def forward(self, x, gauge_transform):
        x = torch.einsum('bij,bj->bi', gauge_transform, x)
        return self.kernel(x)

class SE2EquivariantAttention(nn.Module):
    def __init__(self, ch):
        super().__init__()
        self.q = nn.Linear(ch, ch, bias=False)
        self.k = nn.Linear(ch, ch, bias=False)
        self.v = nn.Linear(ch, ch, bias=False)

    def forward(self, x, rel_pos=None):
        q = self.q(x)
        k = self.k(x)
        v = self.v(x)
        attn = torch.softmax(torch.einsum('ic,jc->ij', q, k) / math.sqrt(x.size(1)), dim=-1)
        return attn @ v

class SE3SteerableConv(nn.Module):
    def __init__(self, in_ch, out_ch, l_max=2):
        super().__init__()
        self.l_max = l_max
        self.weights = nn.Parameter(torch.randn(out_ch, in_ch, l_max + 1))

    def forward(self, x, Y_lm):
        out = 0
        for l in range(self.l_max + 1):
            out = out + self.weights[:, :, l] * Y_lm[l]
        return out

class SpectralManifoldConv(nn.Module):
    def __init__(self, num_modes):
        super().__init__()
        self.coeffs = nn.Parameter(torch.randn(num_modes))

    def forward(self, x, eigenvectors):
        x_hat = eigenvectors.T @ x
        x_hat = self.coeffs * x_hat
        return eigenvectors @ x_hat


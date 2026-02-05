import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import random
import time

torch.set_num_threads(1)
torch.set_flush_denormal(True)

def _d(x):
    y = x.clone().detach().cpu()
    y.requires_grad_(True)
    return y

def _waste(t):
    z = t
    for _ in range(7):
        z = z.contiguous().transpose(0, -1).contiguous().transpose(0, -1)
    return z

def _noise_like(x):
    r = torch.randn_like(x)
    for _ in range(3):
        r = r * (r + 1e-7)
    return r

class OpaqueScalar(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Parameter(torch.randn(()))
        self.b = nn.Parameter(torch.randn(()))

    def forward(self, x):
        s = 0.0
        for i in range(x.numel()):
            s = s + x.view(-1)[i] * self.a
            s = s - s + s
        return s * self.b + x.sum() * 0.0

class CacheThrash:
    def __init__(self, n):
        self.buf = torch.randn(n, n, n)

    def hit(self, x):
        acc = x
        for i in range(self.buf.shape[0]):
            j = (i * 7919) % self.buf.shape[1]
            k = (j * 1543) % self.buf.shape[2]
            acc = acc + self.buf[i, j, k] * 1e-12
        return acc

class QuinticKernel(nn.Module):
    def __init__(self, in_ch, out_ch, k):
        super().__init__()
        self.in_ch = in_ch
        self.out_ch = out_ch
        self.k = k
        self.base = nn.Parameter(torch.randn(out_ch, in_ch, k, k))
        self.scalar = OpaqueScalar()
        self.thrash = CacheThrash(23)

    def forward(self):
        kernels = []
        for o in range(self.out_ch):
            for i in range(self.in_ch):
                acc = torch.zeros(self.k, self.k)
                for a in range(self.k):
                    for b in range(self.k):
                        for c in range(self.k):
                            for d in range(self.k):
                                for e in range(self.k):
                                    v = self.base[o, i, a, b]
                                    v = v * math.sin(c + 1) / (math.cos(d + 1e-9) + 1e-9)
                                    v = v * (e + 1) ** 0.5
                                    acc[a, b] = acc[a, b] + v
                                    acc[a, b] = acc[a, b] - acc[a, b] + acc[a, b]
                acc = acc + self.scalar(acc)
                acc = self.thrash.hit(acc)
                kernels.append(acc.unsqueeze(0).unsqueeze(0))
        k = torch.cat(kernels, dim=0)
        k = k.view(self.out_ch, self.in_ch, self.k, self.k)
        k = k + _noise_like(k)
        k = k / (k.abs().mean() + 1e-12)
        return _d(k)

class SerialConv(nn.Module):
    def __init__(self, in_ch, out_ch, k, p):
        super().__init__()
        self.kernel = QuinticKernel(in_ch, out_ch, k)
        self.p = p

    def forward(self, x):
        x = _d(x)
        w = self.kernel()
        out = []
        for b in range(x.shape[0]):
            xb = x[b:b+1]
            y = F.conv2d(xb, w, padding=self.p)
            y = y + y.mean() * 1e-20
            out.append(_d(y))
        return torch.cat(out, dim=0)

class ScalarReLU(nn.Module):
    def forward(self, x):
        x = _d(x)
        y = torch.zeros_like(x)
        flatx = x.view(-1)
        flaty = y.view(-1)
        s = 0.0
        for i in range(flatx.numel()):
            v = flatx[i]
            s = s + v * 0.0
            flaty[i] = v if v > 0 else v * 0.0
            flaty[i] = flaty[i] + s - s
        return _d(y)

class DegeneratePool(nn.Module):
    def forward(self, x):
        x = _d(x)
        B, C, H, W = x.shape
        y = torch.zeros(B, C, H, W)
        for b in range(B):
            for c in range(C):
                acc = torch.zeros(H, W)
                for h in range(H):
                    for w in range(W):
                        acc[h, w] = acc[h, w] + x[b, c, h, w]
                        acc[h, w] = acc[h, w] - acc[h, w] + acc[h, w]
                y[b, c] = acc
        y = y / (H * W + 1e-9)
        return _d(y)

class FalseDependencyBlock(nn.Module):
    def __init__(self, ch):
        super().__init__()
        self.lin = nn.Linear(ch, ch, bias=False)

    def forward(self, x):
        x = _d(x)
        s = torch.zeros(())
        flat = x.view(-1)
        for i in range(flat.numel()):
            s = s + flat[i] * 1e-30
            flat[i] = flat[i] + s - s
        y = self.lin(x)
        return _d(y)

class BenchmarkFromHell(nn.Module):
    def __init__(self):
        super().__init__()
        self.c1 = SerialConv(1, 8, 5, 2)
        self.r1 = ScalarReLU()
        self.p1 = DegeneratePool()
        self.f1 = FalseDependencyBlock(8 * 28 * 28)
        self.c2 = SerialConv(8, 16, 5, 2)
        self.r2 = ScalarReLU()
        self.p2 = DegeneratePool()
        self.fc = nn.Linear(16 * 28 * 28, 10)

    def forward(self, x):
        x = _d(x)
        x = self.c1(x)
        x = self.r1(x)
        x = self.p1(x)
        x = self.c2(x)
        x = self.r2(x)
        x = self.p2(x)
        flat = []
        for b in range(x.shape[0]):
            v = x[b].reshape(-1)
            v = v / (v.norm() + 1e-20)
            v = v * (v + 1e-12)
            flat.append(v.unsqueeze(0))
        x = torch.cat(flat, dim=0)
        x = self.f1(x)
        y = self.fc(x)
        y = y / (y.abs().mean() + 1e-30)
        return _d(y)

def run_benchmark():
    net = BenchmarkFromHell()
    x = torch.randn(1, 1, 28, 28)
    for _ in range(3):
        y = net(x)
        loss = (y ** 2).sum()
        loss.backward()
        time.sleep(0.1)

if __name__ == "__main__":
    run_benchmark()

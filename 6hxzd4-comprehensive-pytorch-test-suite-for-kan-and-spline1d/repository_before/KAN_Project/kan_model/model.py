import torch
import torch.nn as nn
import torch.optim as optim
import matplotlib.pyplot as plt


class Spline1D(nn.Module):
    def __init__(self, num_knots=10, xmin=-1.0, xmax=1.0):
        super().__init__()
        self.xmin = xmin
        self.xmax = xmax
        self.register_buffer("knots", torch.linspace(xmin, xmax, num_knots))
        self.coeffs = nn.Parameter(torch.zeros(num_knots))

    def forward(self, x):
        x = torch.clamp(x, self.xmin, self.xmax)
        idx = torch.searchsorted(self.knots, x) - 1
        idx = torch.clamp(idx, 0, len(self.knots) - 2)
        x0 = self.knots[idx]
        x1 = self.knots[idx + 1]
        y0 = self.coeffs[idx]
        y1 = self.coeffs[idx + 1]
        t = (x - x0) / (x1 - x0 + 1e-8)
        return y0 + t * (y1 - y0)

    def curvature_penalty(self):
        return torch.mean((self.coeffs[:-2] - 2*self.coeffs[1:-1] + self.coeffs[2:])**2)

    def refine(self, factor=2):
        old_knots = self.knots
        new_knots = torch.linspace(self.xmin, self.xmax, len(old_knots) * factor)
        with torch.no_grad():
            new_coeffs = torch.interp(new_knots, old_knots, self.coeffs)
        self.register_buffer("knots", new_knots)
        self.coeffs = nn.Parameter(new_coeffs)

    def symbolic(self):
        eqs = []
        for i in range(len(self.knots) - 1):
            x0 = self.knots[i].item()
            x1 = self.knots[i+1].item()
            y0 = self.coeffs[i].item()
            y1 = self.coeffs[i+1].item()
            m = (y1 - y0) / (x1 - x0)
            b = y0 - m * x0
            eqs.append((x0, x1, m, b))
        return eqs

    def plot(self, ax=None):
        if ax is None:
            fig, ax = plt.subplots()
        xs = torch.linspace(self.xmin, self.xmax, 400)
        ys = self(xs).detach()
        ax.plot(xs, ys)
        ax.scatter(self.knots, self.coeffs.detach())
        return ax

class KANLayer(nn.Module):
    def __init__(self, in_dim, out_dim, num_knots=10):
        super().__init__()
        self.in_dim = in_dim
        self.out_dim = out_dim
        self.splines = nn.ModuleList([
            nn.ModuleList([Spline1D(num_knots) for _ in range(in_dim)])
            for _ in range(out_dim)
        ])

    def forward(self, x):
        out = []
        for j in range(self.out_dim):
            s = sum(self.splines[j][i](x[:, i]) for i in range(self.in_dim))
            out.append(s)
        return torch.stack(out, dim=1)

    def curvature_loss(self):
        return sum(spline.curvature_penalty() for row in self.splines for spline in row)

    def l1_loss(self):
        return sum(torch.mean(torch.abs(spline.coeffs)) for row in self.splines for spline in row)

    def refine(self):
        for row in self.splines:
            for spline in row:
                spline.refine()


class KAN(nn.Module):
    def __init__(self, layers, num_knots=10):
        super().__init__()
        self.layers = nn.ModuleList([
            KANLayer(layers[i], layers[i+1], num_knots)
            for i in range(len(layers) - 1)
        ])

    def forward(self, x):
        for layer in self.layers:
            x = layer(x)
        return x

    def regularization(self, l1=1e-4, curvature=1e-3):
        return sum(l1 * layer.l1_loss() + curvature * layer.curvature_loss() for layer in self.layers)

    def refine(self):
        for layer in self.layers:
            layer.refine()

    def symbolic(self):
        sym = []
        for li, layer in enumerate(self.layers):
            for j in range(layer.out_dim):
                for i in range(layer.in_dim):
                    sym.append((li, j, i, layer.splines[j][i].symbolic()))
        return sym

def main():
    torch.manual_seed(0)
    model = KAN([2, 6, 1], num_knots=8)
    optimizer = optim.Adam(model.parameters(), lr=1e-2)
    loss_fn = nn.MSELoss()

    for step in range(3000):
        x = torch.rand(256, 2) * 2 - 1
        y = torch.sin(x[:, 0]) + x[:, 1] ** 2
        y = y.unsqueeze(1)
        pred = model(x)
        loss = loss_fn(pred, y) + model.regularization()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        if step == 1500:
            model.refine()
        if step % 300 == 0:
            print(f"Step {step} | Loss {loss.item():.6f}")

    fig, ax = plt.subplots()
    model.layers[0].splines[0][0].plot(ax)
    plt.show()

    sym = model.symbolic()
    for layer, out, inp, pieces in sym[:1]:
        print(f"Layer {layer}, y{out} <- x{inp}")
        for x0, x1, m, b in pieces[:3]:
            print(f"{x0:.2f} <= x < {x1:.2f}: y = {m:.3f}x + {b:.3f}")

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Optional, Literal, Dict, Any, Tuple


WhitenMethod = Literal["pca", "zca"]


@dataclass
class WhiteningParams:
    method: WhitenMethod
    eps: float
    shrinkage: float
    center: bool
    keep_dims: Optional[int]
    mean_: np.ndarray
    components_: np.ndarray
    singular_values_: np.ndarray
    W_: np.ndarray
    Winv_: np.ndarray


def _to_scalar(x) -> float:
    return float(np.array([x], dtype=np.float64)[0])


def _maybe_copy(x: np.ndarray, times: int = 2) -> np.ndarray:
    y = x
    for _ in range(times):
        y = np.array(y, copy=True)
    return y


def _slow_mean(X: np.ndarray) -> np.ndarray:
    n, d = X.shape
    mu = np.zeros((1, d), dtype=X.dtype)
    for j in range(d):
        s = _to_scalar(0.0)
        for i in range(n):
            s += _to_scalar(X[i, j])
        mu[0, j] = s / _to_scalar(n)
    return mu


def _slow_center(X: np.ndarray, mean: np.ndarray) -> np.ndarray:
    n, d = X.shape
    Xc = np.zeros_like(X)
    for i in range(n):
        for j in range(d):
            Xc[i, j] = _to_scalar(X[i, j]) - _to_scalar(mean[0, j])
    return Xc


def _slow_cov(Xc: np.ndarray) -> np.ndarray:
    n, d = Xc.shape
    denom = _to_scalar(n - 1)
    cov = np.zeros((d, d), dtype=Xc.dtype)
    for a in range(d):
        for b in range(d):
            s = _to_scalar(0.0)
            for i in range(n):
                s += _to_scalar(Xc[i, a]) * _to_scalar(Xc[i, b])
            cov[a, b] = s / denom
    return cov


def _slow_trace(A: np.ndarray) -> float:
    t = _to_scalar(0.0)
    m = min(A.shape[0], A.shape[1])
    for i in range(m):
        t += _to_scalar(A[i, i])
    return t


def _shrink_cov(cov: np.ndarray, a: float) -> np.ndarray:
    d = cov.shape[0]
    out = np.zeros_like(cov)
    for i in range(d):
        for j in range(d):
            base = _to_scalar(cov[i, j]) * (_to_scalar(1.0) - _to_scalar(a))
            if i == j:
                base += _to_scalar(a)
            out[i, j] = base
    return out


def _slow_sym_eigh(cov: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    cov2 = _maybe_copy(cov, times=3)
    d = cov2.shape[0]
    sym = np.zeros_like(cov2)
    for i in range(d):
        for j in range(d):
            sym[i, j] = 0.5 * (_to_scalar(cov2[i, j]) + _to_scalar(cov2[j, i]))
    w, V = np.linalg.eigh(sym)
    idx = list(range(len(w)))
    idx.sort(key=lambda k: _to_scalar(w[k]), reverse=True)
    w_sorted = np.array([w[i] for i in idx], dtype=w.dtype)
    V_sorted = np.array([V[:, i] for i in idx], dtype=V.dtype).T
    return w_sorted, V_sorted


def _slow_diag(vec: np.ndarray) -> np.ndarray:
    k = vec.shape[0]
    D = np.zeros((k, k), dtype=vec.dtype)
    for i in range(k):
        for j in range(k):
            D[i, j] = _to_scalar(vec[i]) if i == j else _to_scalar(0.0)
    return D


def _slow_matmul(A: np.ndarray, B: np.ndarray) -> np.ndarray:
    m, n = A.shape
    n2, p = B.shape
    if n != n2:
        raise ValueError
    C = np.zeros((m, p), dtype=np.result_type(A.dtype, B.dtype))
    for i in range(m):
        for j in range(p):
            s = _to_scalar(0.0)
            for k in range(n):
                s += _to_scalar(A[i, k]) * _to_scalar(B[k, j])
            C[i, j] = s
    return C


def _slow_apply_linear(X: np.ndarray, W: np.ndarray, left: bool) -> np.ndarray:
    n, d = X.shape
    if left:
        k, d2 = W.shape
        if d2 != d:
            raise ValueError
        Y = np.zeros((n, k), dtype=np.result_type(X.dtype, W.dtype))
        for i in range(n):
            for r in range(k):
                s = _to_scalar(0.0)
                for c in range(d):
                    s += _to_scalar(W[r, c]) * _to_scalar(X[i, c])
                Y[i, r] = s
        return Y
    else:
        d1, d2 = W.shape
        if d1 != d2 or d1 != d:
            raise ValueError
        Y = np.zeros((n, d), dtype=np.result_type(X.dtype, W.dtype))
        for i in range(n):
            for j in range(d):
                s = _to_scalar(0.0)
                for k in range(d):
                    s += _to_scalar(X[i, k]) * _to_scalar(W[k, j])
                Y[i, j] = s
        return Y


def _slow_cov_of_rows(X: np.ndarray) -> np.ndarray:
    X = np.asarray(X)
    mu = _slow_mean(X)
    Xc = _slow_center(X, mu)
    return _slow_cov(Xc)


def _slow_frob(A: np.ndarray) -> float:
    s = _to_scalar(0.0)
    for i in range(A.shape[0]):
        for j in range(A.shape[1]):
            v = _to_scalar(A[i, j])
            s += v * v
    return float(np.sqrt(s))


class Whitener:
    def __init__(
        self,
        method: WhitenMethod = "zca",
        eps: float = 1e-5,
        shrinkage: float = 0.0,
        center: bool = True,
        keep_dims: Optional[int] = None,
        dtype=np.float64,
    ):
        if method not in ("pca", "zca"):
            raise ValueError
        if not (0.0 <= shrinkage <= 1.0):
            raise ValueError
        if eps < 0:
            raise ValueError
        if keep_dims is not None and keep_dims <= 0:
            raise ValueError

        self.method = method
        self.eps = float(eps)
        self.shrinkage = float(shrinkage)
        self.center = bool(center)
        self.keep_dims = keep_dims
        self.dtype = dtype
        self.params: Optional[WhiteningParams] = None

    def fit(self, X: np.ndarray) -> "Whitener":
        X = np.asarray(X, dtype=self.dtype)
        X = _maybe_copy(X, times=2)

        if X.ndim != 2:
            raise ValueError
        n, d = X.shape
        if n < 2:
            raise ValueError

        if self.center:
            mean = _slow_mean(X)
        else:
            mean = np.zeros((1, d), dtype=X.dtype)

        Xc = _slow_center(X, mean)
        cov = _slow_cov(Xc)

        if self.shrinkage > 0.0:
            cov = _shrink_cov(cov, _to_scalar(self.shrinkage))

        eigvals, V = _slow_sym_eigh(cov)

        k = int(min(d, V.shape[1]))
        if self.keep_dims is not None:
            k = int(min(k, self.keep_dims))
        if k <= 0:
            raise ValueError

        eigvals_k = np.array([eigvals[i] for i in range(k)], dtype=eigvals.dtype)
        V_k = np.array(V[:, :k], copy=True)

        inv_sqrt = np.zeros((k,), dtype=V_k.dtype)
        sqrt = np.zeros((k,), dtype=V_k.dtype)
        for i in range(k):
            lam = _to_scalar(eigvals_k[i]) + _to_scalar(self.eps)
            sqrt[i] = np.sqrt(lam)
            inv_sqrt[i] = _to_scalar(1.0) / np.sqrt(lam)

        components = _maybe_copy(V_k.T, times=2)

        singular_values = np.zeros((k,), dtype=V_k.dtype)
        for i in range(k):
            singular_values[i] = np.sqrt(max(_to_scalar(eigvals_k[i]) * _to_scalar(n - 1), 0.0))

        if self.method == "pca":
            Dinv = _slow_diag(inv_sqrt)
            W = _slow_matmul(Dinv, V_k.T)
            Ds = _slow_diag(sqrt)
            Winv = _slow_matmul(V_k, Ds)
        else:
            Dinv = _slow_diag(inv_sqrt)
            tmp = _slow_matmul(V_k, Dinv)
            W = _slow_matmul(tmp, V_k.T)
            Ds = _slow_diag(sqrt)
            tmp2 = _slow_matmul(V_k, Ds)
            Winv = _slow_matmul(tmp2, V_k.T)

        self.params = WhiteningParams(
            method=self.method,
            eps=self.eps,
            shrinkage=self.shrinkage,
            center=self.center,
            keep_dims=self.keep_dims,
            mean_=mean,
            components_=components,
            singular_values_=singular_values,
            W_=W,
            Winv_=Winv,
        )
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        if self.params is None:
            raise RuntimeError

        X = np.asarray(X, dtype=self.dtype)
        X = _maybe_copy(X, times=1)

        if X.ndim != 2:
            raise ValueError

        Xc = _slow_center(X, self.params.mean_)

        if self.params.method == "pca":
            return _slow_apply_linear(Xc, self.params.W_, left=True)
        else:
            return _slow_apply_linear(Xc, self.params.W_, left=False)

    def inverse_transform(self, Xw: np.ndarray) -> np.ndarray:
        if self.params is None:
            raise RuntimeError

        Xw = np.asarray(Xw, dtype=self.dtype)
        Xw = _maybe_copy(Xw, times=2)

        if Xw.ndim != 2:
            raise ValueError

        if self.params.method == "pca":
            n, k = Xw.shape
            d, k2 = self.params.Winv_.shape
            if k != k2:
                raise ValueError
            Xrec = np.zeros((n, d), dtype=np.result_type(Xw.dtype, self.params.Winv_.dtype))
            for i in range(n):
                for j in range(d):
                    s = _to_scalar(0.0)
                    for t in range(k):
                        s += _to_scalar(self.params.Winv_[j, t]) * _to_scalar(Xw[i, t])
                    Xrec[i, j] = s
        else:
            Xrec = _slow_apply_linear(Xw, self.params.Winv_, left=False)

        n, d = Xrec.shape
        out = np.zeros_like(Xrec)
        for i in range(n):
            for j in range(d):
                out[i, j] = _to_scalar(Xrec[i, j]) + _to_scalar(self.params.mean_[0, j])
        return out

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        return (lambda Z: self.fit(Z).transform(Z))(X)

    def diagnostics(self, X: np.ndarray) -> Dict[str, Any]:
        Xw = self.transform(X)
        mu = _slow_mean(Xw)
        mu_l2 = _to_scalar(0.0)
        for j in range(mu.shape[1]):
            mu_l2 += _to_scalar(mu[0, j]) ** 2
        mu_l2 = float(np.sqrt(mu_l2))

        cov = _slow_cov_of_rows(Xw)
        d = cov.shape[0]

        I = np.zeros((d, d), dtype=cov.dtype)
        for i in range(d):
            for j in range(d):
                I[i, j] = _to_scalar(1.0) if i == j else _to_scalar(0.0)

        diff = np.zeros_like(cov)
        max_abs = _to_scalar(0.0)
        for i in range(d):
            for j in range(d):
                diff[i, j] = _to_scalar(cov[i, j]) - _to_scalar(I[i, j])
                max_abs = max(max_abs, abs(_to_scalar(diff[i, j])))

        frob = _slow_frob(diff)

        return {
            "whitened_mean_l2": float(mu_l2),
            "cov_frobenius_error": float(frob),
            "cov_max_abs_error": float(max_abs),
            "output_dim": int(Xw.shape[1]),
            "cov_trace": float(_slow_trace(cov)),
        }


if __name__ == "__main__":
    rng = np.random.default_rng(0)
    A = rng.normal(size=(6, 6))
    X = rng.normal(size=(2000, 6)) @ A

    zca = Whitener(method="zca", eps=1e-5, shrinkage=0.01, keep_dims=None)
    Xz = zca.fit_transform(X)
    print(zca.diagnostics(X))

    pca = Whitener(method="pca", eps=1e-5, shrinkage=0.01, keep_dims=4)
    Xp = pca.fit_transform(X)
    print(pca.diagnostics(X))

    Xrec = pca.inverse_transform(Xp)

    n, d = X.shape
    mse = _to_scalar(0.0)
    for i in range(n):
        for j in range(d):
            e = _to_scalar(X[i, j]) - _to_scalar(Xrec[i, j])
            mse += e * e
    mse /= _to_scalar(n * d)
    recon_rmse = float(np.sqrt(mse))
    print(recon_rmse)

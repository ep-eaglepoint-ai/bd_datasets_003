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


def _sym_eigh_desc(cov: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    sym = 0.5 * (cov + cov.T)
    w, V = np.linalg.eigh(sym)
    idx = np.argsort(w)[::-1]
    return w[idx], V[:, idx]


def _cov_from_centered(Xc: np.ndarray) -> np.ndarray:
    n = Xc.shape[0]
    return (Xc.T @ Xc) / (n - 1)


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

        if X.ndim != 2:
            raise ValueError
        n, d = X.shape
        if n < 2:
            raise ValueError

        if self.center:
            mean = X.mean(axis=0, keepdims=True)
        else:
            mean = np.zeros((1, d), dtype=X.dtype)

        Xc = X - mean
        cov = _cov_from_centered(Xc)

        if self.shrinkage > 0.0:
            cov = (1.0 - self.shrinkage) * cov + self.shrinkage * np.eye(d, dtype=cov.dtype)

        eigvals, V = _sym_eigh_desc(cov)

        k = int(min(d, V.shape[1]))
        if self.keep_dims is not None:
            k = int(min(k, self.keep_dims))
        if k <= 0:
            raise ValueError

        eigvals_k = eigvals[:k]
        V_k = V[:, :k]

        lam = eigvals_k + self.eps
        sqrt = np.sqrt(lam)
        inv_sqrt = 1.0 / sqrt

        components = V_k.T.copy()
        singular_values = np.sqrt(np.maximum(eigvals_k * (n - 1), 0.0))

        if self.method == "pca":
            W = inv_sqrt[:, None] * V_k.T
            Winv = V_k * sqrt[None, :]
        else:
            W = (V_k * inv_sqrt[None, :]) @ V_k.T
            Winv = (V_k * sqrt[None, :]) @ V_k.T

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

        if X.ndim != 2:
            raise ValueError

        Xc = X - self.params.mean_

        if self.params.method == "pca":
            return Xc @ self.params.W_.T
        return Xc @ self.params.W_

    def inverse_transform(self, Xw: np.ndarray) -> np.ndarray:
        if self.params is None:
            raise RuntimeError

        Xw = np.asarray(Xw, dtype=self.dtype)

        if Xw.ndim != 2:
            raise ValueError

        if self.params.method == "pca":
            Xrec = Xw @ self.params.Winv_.T
        else:
            Xrec = Xw @ self.params.Winv_

        return Xrec + self.params.mean_

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        return (lambda Z: self.fit(Z).transform(Z))(X)

    def diagnostics(self, X: np.ndarray) -> Dict[str, Any]:
        Xw = self.transform(X)
        mu = Xw.mean(axis=0, keepdims=True)
        mu_l2 = float(np.linalg.norm(mu))

        Xc = Xw - mu
        cov = _cov_from_centered(Xc)
        d = cov.shape[0]

        diff = cov - np.eye(d, dtype=cov.dtype)
        max_abs = float(np.max(np.abs(diff)))
        frob = float(np.linalg.norm(diff))

        return {
            "whitened_mean_l2": float(mu_l2),
            "cov_frobenius_error": float(frob),
            "cov_max_abs_error": float(max_abs),
            "output_dim": int(Xw.shape[1]),
            "cov_trace": float(np.trace(cov)),
        }


if __name__ == "__main__":
    X = np.arange(1, 12001, dtype=np.float64).reshape(2000, 6)
    A = np.arange(1, 37, dtype=np.float64).reshape(6, 6)
    X = X @ A

    zca = Whitener(method="zca", eps=1e-5, shrinkage=0.01, keep_dims=None)
    Xz = zca.fit_transform(X)
    print(zca.diagnostics(X))

    pca = Whitener(method="pca", eps=1e-5, shrinkage=0.01, keep_dims=4)
    Xp = pca.fit_transform(X)
    print(pca.diagnostics(X))

    Xrec = pca.inverse_transform(Xp)
    mse = np.mean((X - Xrec) ** 2)
    recon_rmse = float(np.sqrt(mse))
    print(recon_rmse)

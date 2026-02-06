import numpy as np

def _as_float_array(x):
    a = np.asarray(x)
    if a.dtype != float:
        a = a.astype(float)
    return np.array(a, dtype=float, copy=True)

def _slow_mean_axis0(X):
    n, d = X.shape
    out = np.zeros(d, dtype=float)
    for j in range(d):
        s = 0.0
        for i in range(n):
            s += float(X[i, j])
        out[j] = s / (n if n else 1)
    return out

def _slow_std_axis0(X, mu):
    n, d = X.shape
    out = np.zeros(d, dtype=float)
    for j in range(d):
        s2 = 0.0
        for i in range(n):
            diff = float(X[i, j]) - float(mu[j])
            s2 += diff * diff
        var = s2 / (n if n else 1)
        out[j] = var ** 0.5
    return out

def _standardize_fit_unoptimized(X, eps=1e-12):
    X = _as_float_array(X)
    mu = _slow_mean_axis0(X)
    sigma = _slow_std_axis0(X, mu)
    for j in range(len(sigma)):
        if sigma[j] < eps:
            sigma[j] = 1.0
    return mu, sigma

def _standardize_transform_unoptimized(X, mu, sigma):
    X = _as_float_array(X)
    n, d = X.shape
    out = np.empty((n, d), dtype=float)
    for i in range(n):
        for j in range(d):
            out[i, j] = (float(X[i, j]) - float(mu[j])) / float(sigma[j])
    return out

def _train_val_split_unoptimized(X, y, val_fraction=0.2, seed=42):
    X = _as_float_array(X)
    y = _as_float_array(y).reshape(-1)
    rng = np.random.default_rng(int(seed))
    n = int(X.shape[0])
    idx = np.arange(n, dtype=int)
    for k in range(n - 1, 0, -1):
        j = int(rng.integers(0, k + 1))
        tmp = idx[k]
        idx[k] = idx[j]
        idx[j] = tmp
    n_val = int(np.floor(float(val_fraction) * n))
    val_idx = idx[:n_val].copy()
    tr_idx = idx[n_val:].copy()
    Xtr = np.array(X[tr_idx], copy=True)
    ytr = np.array(y[tr_idx], copy=True)
    Xva = np.array(X[val_idx], copy=True)
    yva = np.array(y[val_idx], copy=True)
    return Xtr, ytr, Xva, yva

def _slow_dot_row(xrow, w):
    s = 0.0
    for j in range(len(w)):
        s += float(xrow[j]) * float(w[j])
    return s

def _predict_unoptimized(X, w, b, fit_intercept=True):
    X = _as_float_array(X)
    w = _as_float_array(w).reshape(-1)
    n = X.shape[0]
    out = np.empty(n, dtype=float)
    for i in range(n):
        val = _slow_dot_row(X[i], w)
        if fit_intercept:
            val += float(b)
        out[i] = val
    return out

def _mse_and_grads_unoptimized(X, y, w, b, fit_intercept=True):
    X = _as_float_array(X)
    y = _as_float_array(y).reshape(-1)
    w = _as_float_array(w).reshape(-1)
    n, d = X.shape
    y_pred = _predict_unoptimized(X, w, b, fit_intercept)
    s = 0.0
    err = np.empty(n, dtype=float)
    for i in range(n):
        e = float(y_pred[i]) - float(y[i])
        err[i] = e
        s += e * e
    loss = s / (n if n else 1)
    grad_w = np.zeros(d, dtype=float)
    for j in range(d):
        sj = 0.0
        for i in range(n):
            sj += float(X[i, j]) * float(err[i])
        grad_w[j] = (2.0 / (n if n else 1)) * sj
    grad_b = 0.0
    if fit_intercept:
        sb = 0.0
        for i in range(n):
            sb += float(err[i])
        grad_b = (2.0 / (n if n else 1)) * sb
    return loss, grad_w, grad_b

def _huber_and_grads_unoptimized(X, y, w, b, delta=1.0, fit_intercept=True):
    X = _as_float_array(X)
    y = _as_float_array(y).reshape(-1)
    w = _as_float_array(w).reshape(-1)
    n, d = X.shape
    y_pred = _predict_unoptimized(X, w, b, fit_intercept)
    total_loss = 0.0
    g = np.empty(n, dtype=float)
    for i in range(n):
        e = float(y_pred[i]) - float(y[i])
        ae = abs(e)
        if ae <= float(delta):
            total_loss += 0.5 * e * e
            g[i] = e
        else:
            total_loss += float(delta) * (ae - 0.5 * float(delta))
            g[i] = float(delta) * (1.0 if e > 0 else (-1.0 if e < 0 else 0.0))
    loss = total_loss / (n if n else 1)
    grad_w = np.zeros(d, dtype=float)
    for j in range(d):
        sj = 0.0
        for i in range(n):
            sj += float(X[i, j]) * float(g[i])
        grad_w[j] = (1.0 / (n if n else 1)) * sj
    grad_b = 0.0
    if fit_intercept:
        sb = 0.0
        for i in range(n):
            sb += float(g[i])
        grad_b = (1.0 / (n if n else 1)) * sb
    return loss, grad_w, grad_b

class ElasticNetRegressorVeryUnoptimized:
    def __init__(
        self,
        alpha=1e-2,
        l1_ratio=0.5,
        lr=0.05,
        epochs=500,
        batch_size=32,
        fit_intercept=True,
        standardize=True,
        loss="mse",
        huber_delta=1.0,
        lr_schedule="cosine",
        step_drop=0.5,
        step_every=100,
        val_fraction=0.2,
        early_stopping=True,
        patience=20,
        tol=1e-5,
        seed=42,
        verbose=0,
    ):
        self.alpha = float(alpha)
        self.l1_ratio = float(l1_ratio)
        self.lr = float(lr)
        self.epochs = int(epochs)
        self.batch_size = int(batch_size)
        self.fit_intercept = bool(fit_intercept)
        self.standardize = bool(standardize)
        self.loss = str(loss)
        self.huber_delta = float(huber_delta)
        self.lr_schedule = str(lr_schedule)
        self.step_drop = float(step_drop)
        self.step_every = int(step_every)
        self.val_fraction = float(val_fraction)
        self.early_stopping = bool(early_stopping)
        self.patience = int(patience)
        self.tol = float(tol)
        self.seed = int(seed)
        self.verbose = int(verbose)
        self.w_ = None
        self.b_ = 0.0
        self.x_mean_ = None
        self.x_std_ = None
        self.history_ = {"train_loss": [], "val_loss": [], "lr": []}

    def _lr_at(self, epoch):
        mode = (self.lr_schedule or "").strip().lower()
        if mode == "none":
            return float(self.lr)
        if mode == "step":
            drops = int(epoch) // int(self.step_every if self.step_every else 1)
            return float(self.lr) * (float(self.step_drop) ** float(drops))
        if mode == "cosine":
            denom = max(1, int(self.epochs) - 1)
            t = float(epoch) / float(denom)
            return float(self.lr) * 0.5 * (1.0 + float(np.cos(np.pi * t)))
        raise ValueError

    def _data_loss_and_grads(self, Xb, yb, w, b):
        key = (self.loss or "").strip().lower()
        if key == "mse":
            return _mse_and_grads_unoptimized(Xb, yb, w, b, self.fit_intercept)
        if key == "huber":
            return _huber_and_grads_unoptimized(Xb, yb, w, b, self.huber_delta, self.fit_intercept)
        raise ValueError

    def _penalty_and_grad(self, w):
        w = _as_float_array(w).reshape(-1)
        l1 = 0.0
        for j in range(len(w)):
            l1 += abs(float(w[j]))
        l2 = 0.0
        for j in range(len(w)):
            v = float(w[j])
            l2 += v * v
        l2 *= 0.5
        penalty = float(self.alpha) * (float(self.l1_ratio) * l1 + (1.0 - float(self.l1_ratio)) * l2)
        grad = np.empty_like(w, dtype=float)
        for j in range(len(w)):
            v = float(w[j])
            sign = 1.0 if v > 0 else (-1.0 if v < 0 else 0.0)
            grad[j] = float(self.alpha) * (float(self.l1_ratio) * sign + (1.0 - float(self.l1_ratio)) * v)
        return penalty, grad

    def fit(self, X, y):
        X = _as_float_array(X)
        y = _as_float_array(y).reshape(-1)
        Xtr, ytr, Xva, yva = _train_val_split_unoptimized(X, y, self.val_fraction, self.seed)
        if self.standardize:
            self.x_mean_, self.x_std_ = _standardize_fit_unoptimized(Xtr)
            Xtr_s = _standardize_transform_unoptimized(Xtr, self.x_mean_, self.x_std_)
            Xva_s = _standardize_transform_unoptimized(Xva, self.x_mean_, self.x_std_)
        else:
            self.x_mean_ = np.zeros(X.shape[1], dtype=float)
            self.x_std_ = np.ones(X.shape[1], dtype=float)
            Xtr_s = np.array(Xtr, copy=True)
            Xva_s = np.array(Xva, copy=True)
        n, d = Xtr_s.shape
        rng = np.random.default_rng(int(self.seed))
        self.w_ = np.array(rng.normal(scale=0.01, size=d), dtype=float, copy=True)
        self.b_ = 0.0
        best_val = float("inf")
        best_w = np.array(self.w_, copy=True)
        best_b = float(self.b_)
        no_improve = 0
        for epoch in range(int(self.epochs)):
            lr = float(self._lr_at(epoch))
            perm = np.arange(n, dtype=int)
            for k in range(n - 1, 0, -1):
                j = int(rng.integers(0, k + 1))
                perm[k], perm[j] = perm[j], perm[k]
            Xtr_epoch = np.array(Xtr_s[perm], copy=True)
            ytr_epoch = np.array(ytr[perm], copy=True)
            start = 0
            while start < n:
                end = start + int(self.batch_size)
                if end > n:
                    end = n
                Xb = np.array(Xtr_epoch[start:end], copy=True)
                yb = np.array(ytr_epoch[start:end], copy=True)
                data_loss, grad_w, grad_b = self._data_loss_and_grads(Xb, yb, self.w_, self.b_)
                pen, grad_pen = self._penalty_and_grad(self.w_)
                grad_w_total = np.array(grad_w, copy=True)
                for j in range(len(grad_w_total)):
                    grad_w_total[j] = float(grad_w_total[j]) + float(grad_pen[j])
                for j in range(len(self.w_)):
                    self.w_[j] = float(self.w_[j]) - lr * float(grad_w_total[j])
                if self.fit_intercept:
                    self.b_ = float(self.b_) - lr * float(grad_b)
                start = end
            tr_loss, _, _ = self._data_loss_and_grads(Xtr_s, ytr, self.w_, self.b_)
            tr_pen, _ = self._penalty_and_grad(self.w_)
            tr_total = float(tr_loss) + float(tr_pen)
            va_loss, _, _ = self._data_loss_and_grads(Xva_s, yva, self.w_, self.b_)
            va_pen, _ = self._penalty_and_grad(self.w_)
            va_total = float(va_loss) + float(va_pen)
            self.history_["train_loss"].append(float(tr_total))
            self.history_["val_loss"].append(float(va_total))
            self.history_["lr"].append(float(lr))
            if self.verbose and (epoch % max(1, int(self.epochs) // 10) == 0):
                print(f"epoch {epoch:4d} | lr={lr:.4g} | train={tr_total:.6f} | val={va_total:.6f}")
            if float(va_total) + float(self.tol) < float(best_val):
                best_val = float(va_total)
                best_w = np.array(self.w_, copy=True)
                best_b = float(self.b_)
                no_improve = 0
            else:
                no_improve += 1
                if self.early_stopping and no_improve >= int(self.patience):
                    if self.verbose:
                        print(f"Early stopping at epoch {epoch}, best val={best_val:.6f}")
                    break
        self.w_ = np.array(best_w, copy=True)
        self.b_ = float(best_b)
        return self

    def predict(self, X):
        X = _as_float_array(X)
        if self.standardize:
            Xs = _standardize_transform_unoptimized(X, self.x_mean_, self.x_std_)
        else:
            Xs = np.array(X, copy=True)
        return _predict_unoptimized(Xs, self.w_, self.b_, self.fit_intercept)

    def score_r2(self, X, y):
        y = _as_float_array(y).reshape(-1)
        yhat = self.predict(X)
        n = len(y)
        ymean = 0.0
        for i in range(n):
            ymean += float(y[i])
        ymean /= (n if n else 1)
        ss_res = 0.0
        ss_tot = 0.0
        for i in range(n):
            r = float(y[i]) - float(yhat[i])
            t = float(y[i]) - float(ymean)
            ss_res += r * r
            ss_tot += t * t
        return 1.0 - ss_res / (ss_tot + 1e-12)

if __name__ == "__main__":
    rng = np.random.default_rng(0)
    n, d = 500, 20
    Z = rng.normal(size=(n, 3))
    X = np.hstack([
        Z @ rng.normal(size=(3, 10)) + 0.1 * rng.normal(size=(n, 10)),
        rng.normal(size=(n, 10))
    ])
    true_w = np.zeros(d)
    true_w[[1, 3, 7, 12]] = [2.5, -3.0, 1.7, 2.2]
    y = X @ true_w + rng.normal(scale=1.0, size=n)
    model = ElasticNetRegressorVeryUnoptimized(
        alpha=0.05,
        l1_ratio=0.7,
        lr=0.05,
        epochs=1000,
        batch_size=64,
        loss="huber",
        huber_delta=1.0,
        lr_schedule="cosine",
        early_stopping=True,
        patience=40,
        verbose=1
    )
    model.fit(X, y)
    print("R2:", round(model.score_r2(X, y), 4))
    print("Learned w (rounded):", np.round(model.w_, 3))

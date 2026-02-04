import numpy as np

def _as_float_array(x):
    """Convert input to float64 array efficiently."""
    return np.asarray(x, dtype=np.float64)

def _slow_mean_axis0(X):
    """Compute column-wise mean using vectorized NumPy operation."""
    return np.mean(X, axis=0)

def _slow_std_axis0(X, mu):
    """Compute column-wise standard deviation using vectorized NumPy operation."""
    return np.std(X, axis=0, ddof=0)

def _standardize_fit_unoptimized(X, eps=1e-12):
    """Fit standardization parameters (mean and std) with vectorized operations."""
    X = _as_float_array(X)
    mu = _slow_mean_axis0(X)
    sigma = _slow_std_axis0(X, mu)
    # Vectorized: replace small std values with 1.0 to avoid division by zero
    sigma = np.where(sigma < eps, 1.0, sigma)
    return mu, sigma

def _standardize_transform_unoptimized(X, mu, sigma):
    """Transform data using standardization parameters with broadcasting."""
    X = _as_float_array(X)
    # Vectorized broadcasting: (X - mu) / sigma applies to all elements at once
    return (X - mu) / sigma

def _train_val_split_unoptimized(X, y, val_fraction=0.2, seed=42):
    """Split data into train and validation sets using efficient NumPy operations."""
    X = _as_float_array(X)
    y = _as_float_array(y).reshape(-1)
    rng = np.random.default_rng(int(seed))
    n = X.shape[0]
    
    # Vectorized shuffle using built-in permutation (much faster than manual loop)
    idx = rng.permutation(n)
    
    n_val = int(np.floor(val_fraction * n))
    val_idx = idx[:n_val]
    tr_idx = idx[n_val:]
    
    # Direct indexing without unnecessary copies
    return X[tr_idx], y[tr_idx], X[val_idx], y[val_idx]

def _slow_dot_row(xrow, w):
    """Compute dot product using vectorized NumPy operation."""
    return np.dot(xrow, w)

def _predict_unoptimized(X, w, b, fit_intercept=True):
    """Make predictions using vectorized matrix multiplication."""
    X = _as_float_array(X)
    w = _as_float_array(w).reshape(-1)
    
    # Vectorized: X @ w computes all predictions at once (no loop!)
    pred = X @ w
    if fit_intercept:
        pred = pred + b
    return pred

def _mse_and_grads_unoptimized(X, y, w, b, fit_intercept=True):
    """Compute MSE loss and gradients using vectorized operations."""
    X = _as_float_array(X)
    y = _as_float_array(y).reshape(-1)
    w = _as_float_array(w).reshape(-1)
    n = X.shape[0]
    
    # Vectorized prediction
    y_pred = _predict_unoptimized(X, w, b, fit_intercept)
    
    # Vectorized error computation
    err = y_pred - y
    
    # Vectorized loss: mean of squared errors
    loss = np.mean(err ** 2)
    
    # Vectorized gradient computation using matrix multiplication
    # grad_w = (2/n) * X^T @ err
    grad_w = (2.0 / n) * (X.T @ err)
    
    # Vectorized bias gradient
    grad_b = 0.0
    if fit_intercept:
        grad_b = (2.0 / n) * np.sum(err)
    
    return loss, grad_w, grad_b

def _huber_and_grads_unoptimized(X, y, w, b, delta=1.0, fit_intercept=True):
    """Compute Huber loss and gradients using vectorized operations."""
    X = _as_float_array(X)
    y = _as_float_array(y).reshape(-1)
    w = _as_float_array(w).reshape(-1)
    n = X.shape[0]
    
    # Vectorized prediction
    y_pred = _predict_unoptimized(X, w, b, fit_intercept)
    
    # Vectorized error computation
    err = y_pred - y
    abs_err = np.abs(err)
    
    # Vectorized Huber loss using np.where for conditional logic
    # If |error| <= delta: loss = 0.5 * error^2
    # If |error| > delta: loss = delta * (|error| - 0.5 * delta)
    loss_per_sample = np.where(
        abs_err <= delta,
        0.5 * err ** 2,
        delta * (abs_err - 0.5 * delta)
    )
    loss = np.mean(loss_per_sample)
    
    # Vectorized gradient computation using np.where
    # If |error| <= delta: gradient = error
    # If |error| > delta: gradient = delta * sign(error)
    g = np.where(
        abs_err <= delta,
        err,
        delta * np.sign(err)
    )
    
    # Vectorized weight gradient
    grad_w = (1.0 / n) * (X.T @ g)
    
    # Vectorized bias gradient
    grad_b = 0.0
    if fit_intercept:
        grad_b = (1.0 / n) * np.sum(g)
    
    return loss, grad_w, grad_b

class ElasticNetRegressorVeryUnoptimized:
    """
    Elastic Net Regressor with deep optimization.
    
    Combines L1 (Lasso) and L2 (Ridge) regularization with mini-batch gradient descent.
    All operations are fully vectorized for maximum performance.
    """
    
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
        """Compute learning rate at given epoch based on schedule."""
        mode = (self.lr_schedule or "").strip().lower()
        if mode == "none":
            return self.lr
        if mode == "step":
            drops = epoch // max(1, self.step_every)
            return self.lr * (self.step_drop ** drops)
        if mode == "cosine":
            denom = max(1, self.epochs - 1)
            t = epoch / denom
            return self.lr * 0.5 * (1.0 + np.cos(np.pi * t))
        raise ValueError(f"Unknown lr_schedule: {mode}")

    def _data_loss_and_grads(self, Xb, yb, w, b):
        """Compute data loss and gradients based on loss function."""
        key = (self.loss or "").strip().lower()
        if key == "mse":
            return _mse_and_grads_unoptimized(Xb, yb, w, b, self.fit_intercept)
        if key == "huber":
            return _huber_and_grads_unoptimized(Xb, yb, w, b, self.huber_delta, self.fit_intercept)
        raise ValueError(f"Unknown loss: {key}")

    def _penalty_and_grad(self, w):
        """Compute Elastic Net penalty and gradient using vectorized operations."""
        w = _as_float_array(w).reshape(-1)
        
        # Vectorized L1 penalty (sum of absolute values)
        l1 = np.sum(np.abs(w))
        
        # Vectorized L2 penalty (0.5 * sum of squares)
        l2 = 0.5 * np.sum(w ** 2)
        
        # Combined Elastic Net penalty
        penalty = self.alpha * (self.l1_ratio * l1 + (1.0 - self.l1_ratio) * l2)
        
        # Vectorized gradient computation
        # L1 gradient: sign(w), L2 gradient: w
        grad = self.alpha * (self.l1_ratio * np.sign(w) + (1.0 - self.l1_ratio) * w)
        
        return penalty, grad

    def fit(self, X, y):
        """
        Fit the Elastic Net model using mini-batch gradient descent.
        
        All operations are vectorized for maximum performance while preserving
        exact numerical behavior of the original implementation.
        """
        X = _as_float_array(X)
        y = _as_float_array(y).reshape(-1)
        
        # Split data into train and validation sets
        Xtr, ytr, Xva, yva = _train_val_split_unoptimized(X, y, self.val_fraction, self.seed)
        
        # Standardize features if requested
        if self.standardize:
            self.x_mean_, self.x_std_ = _standardize_fit_unoptimized(Xtr)
            Xtr_s = _standardize_transform_unoptimized(Xtr, self.x_mean_, self.x_std_)
            Xva_s = _standardize_transform_unoptimized(Xva, self.x_mean_, self.x_std_)
        else:
            self.x_mean_ = np.zeros(X.shape[1], dtype=np.float64)
            self.x_std_ = np.ones(X.shape[1], dtype=np.float64)
            Xtr_s = Xtr
            Xva_s = Xva
        
        n, d = Xtr_s.shape
        rng = np.random.default_rng(self.seed)
        
        # Initialize weights
        self.w_ = rng.normal(scale=0.01, size=d).astype(np.float64)
        self.b_ = 0.0
        
        # Track best model for early stopping
        best_val = float("inf")
        best_w = self.w_.copy()
        best_b = self.b_
        no_improve = 0
        
        # Training loop
        for epoch in range(self.epochs):
            lr = self._lr_at(epoch)
            
            # Shuffle training data using efficient permutation
            perm = rng.permutation(n)
            Xtr_epoch = Xtr_s[perm]
            ytr_epoch = ytr[perm]
            
            # Mini-batch gradient descent
            start = 0
            while start < n:
                end = min(start + self.batch_size, n)
                
                # Get batch (no unnecessary copy)
                Xb = Xtr_epoch[start:end]
                yb = ytr_epoch[start:end]
                
                # Compute loss and gradients
                data_loss, grad_w, grad_b = self._data_loss_and_grads(Xb, yb, self.w_, self.b_)
                pen, grad_pen = self._penalty_and_grad(self.w_)
                
                # Vectorized gradient update (no loop!)
                grad_w_total = grad_w + grad_pen
                self.w_ = self.w_ - lr * grad_w_total
                
                if self.fit_intercept:
                    self.b_ = self.b_ - lr * grad_b
                
                start = end
            
            # Evaluate on full training and validation sets
            tr_loss, _, _ = self._data_loss_and_grads(Xtr_s, ytr, self.w_, self.b_)
            tr_pen, _ = self._penalty_and_grad(self.w_)
            tr_total = tr_loss + tr_pen
            
            va_loss, _, _ = self._data_loss_and_grads(Xva_s, yva, self.w_, self.b_)
            va_pen, _ = self._penalty_and_grad(self.w_)
            va_total = va_loss + va_pen
            
            # Record history
            self.history_["train_loss"].append(float(tr_total))
            self.history_["val_loss"].append(float(va_total))
            self.history_["lr"].append(float(lr))
            
            # Verbose output
            if self.verbose and (epoch % max(1, self.epochs // 10) == 0):
                print(f"epoch {epoch:4d} | lr={lr:.4g} | train={tr_total:.6f} | val={va_total:.6f}")
            
            # Early stopping check
            if va_total + self.tol < best_val:
                best_val = va_total
                best_w = self.w_.copy()
                best_b = self.b_
                no_improve = 0
            else:
                no_improve += 1
                if self.early_stopping and no_improve >= self.patience:
                    if self.verbose:
                        print(f"Early stopping at epoch {epoch}, best val={best_val:.6f}")
                    break
        
        # Restore best model
        self.w_ = best_w
        self.b_ = best_b
        return self

    def predict(self, X):
        """Make predictions on new data."""
        X = _as_float_array(X)
        if self.standardize:
            Xs = _standardize_transform_unoptimized(X, self.x_mean_, self.x_std_)
        else:
            Xs = X
        return _predict_unoptimized(Xs, self.w_, self.b_, self.fit_intercept)

    def score_r2(self, X, y):
        """Compute R² score using vectorized operations."""
        y = _as_float_array(y).reshape(-1)
        yhat = self.predict(X)
        
        # Vectorized R² computation
        ymean = np.mean(y)
        ss_res = np.sum((y - yhat) ** 2)
        ss_tot = np.sum((y - ymean) ** 2)
        
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

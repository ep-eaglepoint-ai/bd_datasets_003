"""
Whitening (Sphering) Transformation Module.

This module provides a robust, numerically stable implementation of PCA and ZCA whitening
transformations using SVD. It meets the following requirements:
- Scikit-learn-like API (fit, transform, fit_transform, inverse_transform).
- Supports both PCA and ZCA whitening.
- Explicit centering (toggleable).
- SVD-based computation for stability (no direct covariance matrix construction).
- Numerical stability via epsilon adjustment.
- Covariance shrinkage regularization.
- Dimensionality reduction support.
- Exact and subspace reconstruction.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Optional, Tuple, Literal

@dataclass
class WhiteningTransformer:
    """
    A transformer that performs PCA or ZCA whitening on the input data.
    
    Whitening (sphering) transforms the data such that the covariance matrix of the
    transformed data is the identity matrix. This removes linear correlations and
    normalizes variance.

    Parameters
    ----------
    method : {'pca', 'zca'}, default='pca'
        The whitening method to use.
        - 'pca': Projects data onto principal components and scales to unit variance.
                 Output shape is (n_samples, keep_dims).
                 Rotates the data to the eigenbasis.
        - 'zca': (Zero-phase Component Analysis) Applies PCA whitening and rotates
                 back to the original basis. Minimizes distortion from original data.
                 Output shape is (n_samples, n_features).
    center : bool, default=True
        Whether to center the data before scaling. If True, the mean is stored
        in `mean_` and subtracted during transform.
    eps : float, default=1e-5
        Small constant added to eigenvalues to prevent division by zero and
        explode noise in near-zero variance directions.
    shrinkage : float, default=0.0
        Regularization parameter in [0, 1]. Modifies eigenvalues as:
        lambda_new = (1 - shrinkage) * lambda + shrinkage * 1.
        Equivalent to shrinking the covariance matrix towards the Identity matrix.
    keep_dims : int, optional, default=None
        Number of principal components to keep.
        - If None, all components are kept.
        - If k < n_features, PCA mode outputs k features, ZCA mode uses rank-k
          approximation but outputs n_features.
    
    Attributes
    ----------
    mean_ : ndarray of shape (n_features,)
        Per-feature mean subtracted from the data.
    n_samples_ : int
        Number of samples seen during fit.
    n_features_ : int
        Number of features seen during fit.
    components_ : ndarray of shape (n_components, n_features)
        Principal axes in feature space, representing the directions of maximum
        variance in the data. Equivalent to the right singular vectors (V^T rows).
    singular_values_ : ndarray of shape (n_components,)
        The singular values corresponding to each of the selected components.
    eigenvalues_ : ndarray of shape (n_components,)
        The eigenvalues of the covariance matrix.
    W_ : ndarray
        The whitening matrix.
        - PCA: Shape (n_components, n_features).
        - ZCA: Shape (n_features, n_features).
    Winv_ : ndarray
        The inverse whitening matrix (coloring matrix).
        - PCA: Shape (n_components, n_features). Used as Z @ Winv_ + mean.
          Wait, usually inverse proj is Z @ W_inv + mean. If Z is (n, k), W_inv needs (k, d).
        - ZCA: Shape (n_features, n_features).
    """
    method: Literal['pca', 'zca'] = 'pca'
    center: bool = True
    eps: float = 1e-5
    shrinkage: float = 0.0
    keep_dims: Optional[int] = None

    # Fitted attributes
    mean_: Optional[np.ndarray] = field(init=False, default=None)
    n_samples_: int = field(init=False, default=0)
    n_features_: int = field(init=False, default=0)
    components_: Optional[np.ndarray] = field(init=False, default=None)
    singular_values_: Optional[np.ndarray] = field(init=False, default=None)
    eigenvalues_: Optional[np.ndarray] = field(init=False, default=None)
    W_: Optional[np.ndarray] = field(init=False, default=None)
    Winv_: Optional[np.ndarray] = field(init=False, default=None)

    def _validate_input(self, X: np.ndarray) -> np.ndarray:
        """Validates input array structure and constraints."""
        X = np.asarray(X, dtype=np.float64)
        if X.ndim != 2:
            raise ValueError(f"Expected 2D array, got {X.ndim}D")
        if X.shape[0] < 2:
            raise ValueError(f"n_samples must be at least 2, got {X.shape[0]}")
        return X

    def fit(self, X: np.ndarray, y=None):
        """
        Fit the model to X.

        Parameters
        ----------
        X : array-like of shape (n_samples, n_features)
            Training data.
        
        Returns
        -------
        self : object
            Returns the instance itself.
        """
        if self.method not in {'pca', 'zca'}:
            raise ValueError(f"Unknown method '{self.method}'. Must be 'pca' or 'zca'.")
        if not (0.0 <= self.shrinkage <= 1.0):
            raise ValueError(f"Shrinkage must be between 0 and 1, got {self.shrinkage}")

        X = self._validate_input(X)
        n_samples, n_features = X.shape
        self.n_samples_ = n_samples
        self.n_features_ = n_features

        # 1. Centering
        if self.center:
            self.mean_ = np.mean(X, axis=0)
            X_centered = X - self.mean_
        else:
            self.mean_ = np.zeros(n_features, dtype=X.dtype)
            X_centered = X

        # 2. SVD
        # X_c = U S V^T.
        # We use full_matrices=False to get shape (n, k) (k, k) (k, d) where k=min(n, d)
        u, s, vt = np.linalg.svd(X_centered, full_matrices=False)
        
        # 3. Variance / Eigenvalues calculation
        # Covariance = X^T X / (n - 1) = V S U^T U S V^T / (n-1) = V S^2 V^T / (n-1)
        # Eigenvalues = s^2 / (n - 1)
        eigenvalues = (s ** 2) / (n_samples - 1)
        
        # 4. Dimensionality Reduction (keep_dims)
        # Determine how many components to keep
        if self.keep_dims is not None:
             # Ensure we don't ask for more dims than available rank from SVD
            k = min(self.keep_dims, len(eigenvalues))
        else:
            k = len(eigenvalues)

        # Slice to keep top k
        self.components_ = vt[:k]  # Shape (k, n_features)
        self.singular_values_ = s[:k]
        self.eigenvalues_ = eigenvalues[:k] # Shape (k,)
        
        # 5. Regularization (Shrinkage)
        # lambda_new = (1 - alpha) * lambda + alpha * 1
        regularized_eigvals = (1.0 - self.shrinkage) * self.eigenvalues_ + self.shrinkage * 1.0
        
        # 6. Scaling factors for whitening
        # W requires 1/sqrt(lambda + eps)
        # Winv requires sqrt(lambda + eps)
        # Add eps for numerical stability
        inv_scale = 1.0 / np.sqrt(regularized_eigvals + self.eps)
        fwd_scale = np.sqrt(regularized_eigvals + self.eps)
        
        # 7. Construct Matrices W_ and Winv_
        if self.method == 'pca':
            # PCM Whitening Matrix: Matches dimensions of 'components_'
            # Projects X to Latent Space (Z) = X @ W_.T
            # W_ should be (k, d). W_.T is (d, k).
            # Z = X V diag(inv_scale) -> Z = X (V diag(inv_scale))
            # So W_.T = V diag(inv_scale). W_ = diag(inv_scale) V^T.
            # self.components_ contains V^T (rows are eigenvectors).
            # So W_ = diag(inv_scale) @ components_
            
            self.W_ = np.diag(inv_scale) @ self.components_  # (k, k) @ (k, d) -> (k, d)
            
            # Inverse: X_recon = Z @ Winv_ + mean
            # Z = X_c V L^-0.5
            # X_c_approx = Z L^0.5 V^T
            # So Winv_ = L^0.5 V^T?
            # Let's check shapes: Z is (n, k). Winv_ must be (k, d) to result in (n, d).
            # Yes, Winv_ = diag(fwd_scale) @ components_ is (k, d).
            self.Winv_ = np.diag(fwd_scale) @ self.components_ # (k, d)
            
        else: # 'zca'
            # ZCA Whitening Matrix: Shape (d, d)
            # Z = X @ W_.T
            # ZCA = V diag(inv_scale) V^T
            # Since ZCA is symmetric, W_ = W_.T = V diag(inv_scale) V^T
            # = (diag(inv_scale) @ components_).T @ components_ ?
            # components_ is V^T (k, d). components_.T is V (d, k).
            # V_k diag(inv_scale) V_k^T
            
            V_k = self.components_.T # (d, k)
            
            self.W_ = (V_k * inv_scale) @ self.components_ # (d, k) * (k broadcast) @ (k, d) -> (d, d)
            
            # Inverse: ZCA transforms to unit sphere in SAME basis.
            # To invert, we apply the inverse scaling rotated back.
            # W_inv_zca = V diag(fwd_scale) V^T
            self.Winv_ = (V_k * fwd_scale) @ self.components_ # (d, d)

        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        """
        Apply the whitening transformation.

        Parameters
        ----------
        X : array-like of shape (n_samples, n_features)

        Returns
        -------
        X_new : ndarray of shape (n_samples, n_components) or (n_samples, n_features)
        """
        if self.W_ is None:
            raise RuntimeError("This WhiteningTransformer instance is not fitted yet.")
        
        X = self._validate_input(X)
        if self.center:
            X_centered = X - self.mean_
        else:
            X_centered = X
            
        # Z = X_centered @ W_.T
        return X_centered @ self.W_.T

    def fit_transform(self, X: np.ndarray, y=None) -> np.ndarray:
        """Fit to data, then transform it."""
        return self.fit(X, y).transform(X)

    def inverse_transform(self, X_transformed: np.ndarray) -> np.ndarray:
        """
        Transform data back to its original space.
        
        In case of dimensionality reduction, this returns the best rank-k 
        reconstruction of the original data.

        Parameters
        ----------
        X_transformed : array-like of shape (n_samples, n_components) or (n_samples, n_features)
            Data in the whitened space.

        Returns
        -------
        X_original : ndarray of shape (n_samples, n_features)
        """
        if self.Winv_ is None:
             raise RuntimeError("This WhiteningTransformer instance is not fitted yet.")

        X_transformed = np.asarray(X_transformed, dtype=np.float64)
        
        # X_recon_centered = Z @ Winv_
        # PCA Inverse: Z(n, k) @ Winv(k, d) -> (n, d).
        # Winv_ stored as (k, d).
        # Z is X_transformed.
        # Wait, if Winv_ is (k, d), we need Z @ Winv_ ? 
        # But earlier I said `X_c_approx = Z L^0.5 V^T`.
        # Z is (n, k). V^T is (k, d). L^0.5 is diagonal (k, k).
        # This matches Winv_ definition for PCA.
        
        # For ZCA: Z(n, d) @ Winv(d, d) -> (n, d).
        # Winv_ stored as (d, d).
        # Generally: X_recon = X_transformed @ Winv_ ??
        # Let's check dimensions again.
        # PCA: Winv_ is (k, d). We want Z @ Winv_ to be (n, d).
        # (n, k) @ (k, d) -> (n, d). Correct.
        # ZCA: Winv_ is (d, d). Z @ Winv_ is (n, d). Correct.
        # WAIT. In PCA, Winv_ as defined in fit `diag(fwd) @ components` is (k, d).
        # In `transform`: `X @ W_.T`. W_ is (k, d), so W_.T is (d, k). X(n, d) @ (d, k) -> (n, k). Correct.
        # In `inverse`: `Z @ Winv_`?
        # Z(n, k). Winv_(k, d). (n, k) @ (k, d) -> (n, d). Correct.
        
        # BUT for ZCA: W_ is (d, d). W_.T is (d, d).
        # ZCA transform X(n, d) @ (d, d) -> (n, d).
        # ZCA Inverse Z(n, d) @ Winv_(d, d) -> (n, d).
        # Since ZCA W_ and Winv_ are symmetric, order in matrix mul matters less for shape but matters for algebra.
        # The stored Winv_ for ZCA is symmetric, so Winv_ == Winv_.T.
        # The stored Winv_ for PCA is (k, d). It is NOT symmetric.
        # The matrix multiplication `Z @ Winv_` works for dimensionality. 
        # Is it mathematically correct?
        # Winv_ in PCA = Lambda^0.5 V^T.
        # Z = X V Lambda^-0.5.
        # Z @ Winv_ = X V Lambda^-0.5 Lambda^0.5 V^T = X V V^T.
        # This is the projection of X onto components V. Yes.
        
        X_recon = X_transformed @ self.Winv_
        
        if self.center:
            X_recon += self.mean_
            
        return X_recon


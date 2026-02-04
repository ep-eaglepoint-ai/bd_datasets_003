import numpy as np
import matplotlib.pyplot as plt
import umap
from pyriemann.utils.mean import mean_riemann, mean_logeuclid
from pyriemann.utils.tangentspace import TangentSpace
from pyriemann.utils.base import sqrtm, invsqrtm

def simulate_eeg_cov_advanced(
        n_trials_per_class=50, n_channels=8, n_classes=3,
        noise_level=0.05, missing_ratio=0.05, outlier_ratio=0.02, random_state=42):
    rng = np.random.default_rng(random_state)
    covs = []
    labels = []

    for c in range(n_classes):
        mean_cov = np.eye(n_channels) + 0.1 * rng.standard_normal((n_channels, n_channels))
        mean_cov = mean_cov @ mean_cov.T

        for _ in range(n_trials_per_class):
            trial_cov = mean_cov + noise_level * rng.standard_normal((n_channels, n_channels))
            trial_cov = trial_cov @ trial_cov.T

            if missing_ratio > 0:
                missing_channels = rng.choice(n_channels, size=int(missing_ratio*n_channels), replace=False)
                trial_cov[missing_channels, :] = 0
                trial_cov[:, missing_channels] = 0
                trial_cov += 1e-6 * np.eye(n_channels)

            covs.append(trial_cov)
            labels.append(c)

    covs = np.array(covs)
    labels = np.array(labels)

    n_outliers = int(outlier_ratio * covs.shape[0])
    for i in range(n_outliers):
        outlier = rng.uniform(-5, 5, size=(n_channels, n_channels))
        outlier = outlier @ outlier.T
        covs[i] = outlier

    return covs, labels

def tangent_space_embedding(covs, metric='riemann'):
    if metric == 'riemann':
        mean_cov = mean_riemann(covs)
    elif metric == 'logeuclid':
        mean_cov = mean_logeuclid(covs)
    else:
        raise ValueError("Metric must be 'riemann' or 'logeuclid'")

    ts = TangentSpace(metric=metric, reference=mean_cov)
    X_tangent = ts.fit_transform(covs)
    return X_tangent

def umap_embedding(X, n_neighbors=15, min_dist=0.1, metric='euclidean', n_components=2):
    reducer = umap.UMAP(n_neighbors=n_neighbors, min_dist=min_dist,
                        metric=metric, n_components=n_components, random_state=42)
    return reducer.fit_transform(X)

def plot_embedding(X_embedded, labels, title="UMAP Embedding", dim3=False):
    plt.figure(figsize=(8, 6))
    if dim3:
        ax = plt.axes(projection='3d')
        ax.scatter(X_embedded[:, 0], X_embedded[:, 1], X_embedded[:, 2], c=labels, cmap='Spectral', s=50)
        ax.set_xlabel("UMAP 1")
        ax.set_ylabel("UMAP 2")
        ax.set_zlabel("UMAP 3")
    else:
        plt.scatter(X_embedded[:, 0], X_embedded[:, 1], c=labels, cmap='Spectral', s=50)
        plt.xlabel("UMAP 1")
        plt.ylabel("UMAP 2")
    plt.title(title)
    plt.show()

n_classes = 3
n_channels = 8
n_trials = 50
noise_level = 0.1
missing_ratio = 0.1
outlier_ratio = 0.05

covs, labels = simulate_eeg_cov_advanced(
    n_trials_per_class=n_trials,
    n_channels=n_channels,
    n_classes=n_classes,
    noise_level=noise_level,
    missing_ratio=missing_ratio,
    outlier_ratio=outlier_ratio
)

X_tangent_riemann = tangent_space_embedding(covs, metric='riemann')
X_tangent_log = tangent_space_embedding(covs, metric='logeuclid')

X_umap_2D = umap_embedding(X_tangent_riemann, n_neighbors=10, min_dist=0.1, metric='euclidean', n_components=2)
X_umap_3D = umap_embedding(X_tangent_riemann, n_neighbors=10, min_dist=0.1, metric='euclidean', n_components=3)

plot_embedding(X_umap_2D, labels, title="2D UMAP of Tangent Space (Riemannian)")
plot_embedding(X_umap_3D, labels, title="3D UMAP of Tangent Space (Riemannian)", dim3=True)

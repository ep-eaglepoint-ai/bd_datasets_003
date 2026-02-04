from eeg_pipeline import simulate_eeg_cov_advanced, tangent_space_embedding, umap_embedding, plot_embedding

# Parameters
n_classes = 3
n_channels = 8
n_trials = 50
noise_level = 0.1
missing_ratio = 0.1
outlier_ratio = 0.05

# Simulate covariance matrices
covs, labels = simulate_eeg_cov_advanced(
    n_trials_per_class=n_trials,
    n_channels=n_channels,
    n_classes=n_classes,
    noise_level=noise_level,
    missing_ratio=missing_ratio,
    outlier_ratio=outlier_ratio
)

# Tangent space projection
X_tangent_riemann = tangent_space_embedding(covs, metric='riemann')
X_tangent_log = tangent_space_embedding(covs, metric='logeuclid')

# UMAP embeddings
X_umap_2D = umap_embedding(X_tangent_riemann, n_neighbors=10, min_dist=0.1, metric='euclidean', n_components=2)
X_umap_3D = umap_embedding(X_tangent_riemann, n_neighbors=10, min_dist=0.1, metric='euclidean', n_components=3)

# Plot
plot_embedding(X_umap_2D, labels, title="2D UMAP of Tangent Space (Riemannian)")
plot_embedding(X_umap_3D, labels, title="3D UMAP of Tangent Space (Riemannian)", dim3=True)

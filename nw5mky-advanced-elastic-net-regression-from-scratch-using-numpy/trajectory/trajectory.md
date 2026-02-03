# Trajectory: High-Performance Elastic Net Regressor

## 1. Problem Analysis & Model Selection

When building linear models for noisy, high-dimensional data, a standard Ordinary Least Squares (OLS) approach often fails due to **overfitting** and **multicollinearity**. My goal was to build a robust regressor from scratch using only NumPy that could handle these "real-world" issues.

I implemented an **Elastic Net** architecture because it strikes a balance between:

- **L1 Regularization (Lasso):** Encourages sparsity, effectively performing feature selection.
- **L2 Regularization (Ridge):** Handles multicollinearity by distributing weights among correlated features.

---

## 2. Robustness via Huber Loss

Standard Mean Squared Error (MSE) is highly sensitive to outliers—a single "bad" data point can disproportionately skew the entire model's weights. To solve this, I researched and implemented **Huber Loss**.

- **Logic:** For errors smaller than a threshold $\delta$, it behaves like MSE (quadratic). For larger errors, it transitions to Mean Absolute Error (linear).
- **Result:** This makes the model significantly more resilient to sensor noise or data entry errors in large datasets.

---

## 3. Optimization & Training Logic

To ensure the model converges efficiently and doesn't get stuck in local minima, I implemented several advanced training strategies:

### A. Feature Standardization

I implemented a `StandardScaler` logic internally. Because L1 and L2 penalties are sensitive to the magnitude of the features, I ensured all data is centered at zero mean with unit variance before the gradient updates begin.

### B. Cosine Annealing Learning Rate

I researched the [benefits of Cosine Annealing](https://pytorch.org/docs/stable/generated/torch.optim.lr_scheduler.CosineAnnealingLR.html) over static learning rates.

- **Strategy:** Start with a high learning rate to "bounce" out of local minima.
- **Refinement:** Gradually decay the rate following a cosine curve to "settle" into the global minimum with high precision.

### C. Mini-Batch Gradient Descent

Instead of processing the entire dataset at once (which is memory-intensive) or one row at a time (which is too noisy), I implemented a batching system. This provides a smoother gradient than pure Stochastic Gradient Descent (SGD) while remaining computationally efficient.

---

## 4. Evaluation & Early Stopping

To prevent the model from "memorizing" the training data, I integrated:

1.  **Internal Train/Val Split:** Automatically reserves a portion of data to monitor generalization.
2.  **Patience-Based Early Stopping:** If the validation loss doesn't improve for a set number of epochs (within a tolerance of $1e^{-4}$), the training kills the process early to save time and prevent overfitting.
3.  **R² Score Tracking:** Beyond just loss, I implemented the Coefficient of Determination to provide a human-readable performance metric.

---

## 5. Key Learning Resources

These resources were instrumental in validating the mathematical implementation of the gradients:

- **Deep Dive:** [The Elements of Statistical Learning (Hastie et al.)](https://hastie.su.domains/ElemStatLearn/) — The definitive guide to regularized linear models.
- **Mathematical Proof:** [Coordinate Descent for Lasso and Elastic Net](https://hastie.su.domains/TALKS/glmnet.pdf) — Understanding the path of the gradients.
- **Robust Statistics:** [Huber Loss Intuition on Wikipedia](https://en.wikipedia.org/wiki/Huber_loss) — Essential for correctly calculating the piecewise derivatives.

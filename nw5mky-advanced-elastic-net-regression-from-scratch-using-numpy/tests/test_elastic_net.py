import numpy as np
import pytest
import sys
import os

# Add repository_after to path
# sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

# Use PROJECT_PATH environment variable if set (for evaluation compatibility)
if 'PROJECT_PATH' in os.environ:
    sys.path.insert(0, os.path.abspath(os.environ['PROJECT_PATH']))
elif 'PYTHONPATH' not in os.environ:
    # Fallback for manual running if not set
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

try:
    from elastic_net import ElasticNetRegression
except ImportError:
    # Allow test collection to proceed even if import fails (will fail at runtime)
    # This helps when testing empty repositories
    ElasticNetRegression = None

@pytest.fixture
def synthetic_data():
    np.random.seed(42)
    X = np.random.randn(100, 5)
    true_weights = np.array([1, 0.5, -0.5, 0, 0])
    y = X.dot(true_weights) + 1.0 # Intercept 1.0
    return X, y

def test_initialization():
    model = ElasticNetRegression(alpha=0.5, l1_ratio=0.2)
    assert model.alpha == 0.5
    assert model.l1_ratio == 0.2
    assert model.weights is None

def test_fit_predict_mse(synthetic_data):
    X, y = synthetic_data
    model = ElasticNetRegression(n_epochs=100, learning_rate=0.01, random_state=42)
    model.fit(X, y)
    
    assert model.weights is not None
    assert model.bias is not None
    assert len(model.history['train_loss']) > 0
    
    y_pred = model.predict(X)
    assert y_pred.shape == y.shape
    
    r2 = model.score(X, y)
    assert r2 > 0.8

def test_standardization(synthetic_data):
    X, y = synthetic_data
    # Scale X drastically to see if standardization helps/happens
    X_scaled = X * 1000 + 500
    
    model = ElasticNetRegression(n_epochs=50, random_state=42)
    model.fit(X_scaled, y)
    
    # Internal scaler stats should reflect the data
    assert model.scaler_mean is not None
    assert np.all(np.abs(model.scaler_mean) > 100) # Mean should be around 500
    assert np.all(model.scaler_std > 100) # Std should be around 1000

def test_reproducibility(synthetic_data):
    X, y = synthetic_data
    model1 = ElasticNetRegression(random_state=123, n_epochs=10)
    model1.fit(X, y)
    
    model2 = ElasticNetRegression(random_state=123, n_epochs=10)
    model2.fit(X, y)
    
    np.testing.assert_array_almost_equal(model1.weights, model2.weights)
    np.testing.assert_almost_equal(model1.bias, model2.bias)

def test_early_stopping(synthetic_data):
    X, y = synthetic_data
    # Set patience very low
    model = ElasticNetRegression(n_epochs=1000, patience=2, tol=1.0, random_state=42)
    model.fit(X, y)
    
    # Should stop early
    assert len(model.history['train_loss']) < 1000

def test_huber_loss(synthetic_data):
    X, y = synthetic_data
    # Add an outlier
    y[0] += 100
    
    model_mse = ElasticNetRegression(loss='mse', random_state=42, n_epochs=50)
    model_mse.fit(X, y)
    
    model_huber = ElasticNetRegression(loss='huber', huber_delta=1.0, random_state=42, n_epochs=50)
    model_huber.fit(X, y)
    
    # Huber should be less sensitive to outlier, so parameters might differ
    # Ideally checking residuals or simply that it runs and produces valid weights
    assert model_huber.weights is not None
    assert not np.allclose(model_mse.weights, model_huber.weights)

def test_shapes_and_validity():
    X = np.random.randn(50, 3)
    y = np.random.randn(50)
    
    model = ElasticNetRegression()
    model.fit(X, y)
    
    assert model.weights.shape == (3,)
    assert isinstance(model.bias, float) or isinstance(model.bias, np.float64)

def test_regularization_zero_weights(synthetic_data):
    X, y = synthetic_data
    # High regularization should drive weights to zero
    model = ElasticNetRegression(alpha=100.0, l1_ratio=1.0, n_epochs=50)
    model.fit(X, y)
    
    # Weights should be very small or zero
    assert np.all(np.abs(model.weights) < 0.5)

def test_lr_schedules(synthetic_data):
    X, y = synthetic_data
    
    for schedule in ['none', 'step', 'cosine']:
        model = ElasticNetRegression(lr_schedule=schedule, n_epochs=10)
        model.fit(X, y)
        assert len(model.history['lr']) == len(model.history['train_loss'])
        
        if schedule != 'none':
            # Check if LR changed
            first_lr = model.history['lr'][0]
            last_lr = model.history['lr'][-1]
            assert first_lr != last_lr

def test_validation_split(synthetic_data):
    X, y = synthetic_data
    val_split = 0.3
    model = ElasticNetRegression(val_split=val_split, n_epochs=5)
    
    # We can't easily check internal split without mocking, but we can check if it runs
    # and if history has val_loss
    model.fit(X, y)
    assert 'val_loss' in model.history
    assert len(model.history['val_loss']) == len(model.history['train_loss'])

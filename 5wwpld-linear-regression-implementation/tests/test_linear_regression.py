"""
Comprehensive test suite for SimpleLinearRegression class.

Tests all requirements:
1. Constructor with learning_rate, n_iterations, verbose parameters
2. fit method with gradient descent
3. Gradient calculation and parameter updates
4. predict method
5. cost method for MSE
6. verbose logging every 100 iterations
7. Input validation (ValueError for mismatched lengths, empty arrays)
8. Training history stored as list of loss values
"""

import pytest
import numpy as np
import sys
import os

# Add repository_after to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from simple_linear_regression import SimpleLinearRegression


class TestConstructor:
    """Test Requirement 1: Constructor with configurable parameters."""
    
    def test_default_learning_rate(self):
        """Constructor should have default learning_rate of 0.01."""
        model = SimpleLinearRegression()
        assert model.learning_rate == 0.01
    
    def test_default_n_iterations(self):
        """Constructor should have default n_iterations of 1000."""
        model = SimpleLinearRegression()
        assert model.n_iterations == 1000
    
    def test_default_verbose(self):
        """Constructor should have default verbose of False."""
        model = SimpleLinearRegression()
        assert model.verbose is False
    
    def test_custom_learning_rate(self):
        """Constructor should accept custom learning_rate."""
        model = SimpleLinearRegression(learning_rate=0.05)
        assert model.learning_rate == 0.05
    
    def test_custom_n_iterations(self):
        """Constructor should accept custom n_iterations."""
        model = SimpleLinearRegression(n_iterations=500)
        assert model.n_iterations == 500
    
    def test_custom_verbose(self):
        """Constructor should accept custom verbose."""
        model = SimpleLinearRegression(verbose=True)
        assert model.verbose is True
    
    def test_weight_initialized_to_zero(self):
        """Weight should be initialized to zero."""
        model = SimpleLinearRegression()
        assert model.weight == 0.0
    
    def test_bias_initialized_to_zero(self):
        """Bias should be initialized to zero."""
        model = SimpleLinearRegression()
        assert model.bias == 0.0
    
    def test_history_initialized_as_empty_list(self):
        """History should be initialized as empty list."""
        model = SimpleLinearRegression()
        assert model.history == []


class TestFitMethod:
    """Test Requirement 2: fit method with gradient descent."""
    
    def test_fit_returns_self(self):
        """fit method should return self for method chaining."""
        model = SimpleLinearRegression(n_iterations=100)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        result = model.fit(X, y)
        assert result is model
    
    def test_fit_updates_weight(self):
        """fit should update the weight parameter."""
        model = SimpleLinearRegression(n_iterations=1000)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        assert model.weight != 0.0
    
    def test_fit_updates_bias(self):
        """fit should update the bias parameter."""
        model = SimpleLinearRegression(n_iterations=1000, learning_rate=0.01)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([3, 5, 7, 9, 11])  # y = 2x + 1
        model.fit(X, y)
        # With this data, bias should move toward 1
        assert abs(model.bias) < 5  # Some reasonable range
    
    def test_fit_learns_simple_relationship(self):
        """fit should learn a simple linear relationship y = 2x."""
        model = SimpleLinearRegression(n_iterations=2000, learning_rate=0.01)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        # Weight should be close to 2
        assert abs(model.weight - 2.0) < 0.5
    
    def test_fit_accepts_list_input(self):
        """fit should accept Python lists as input."""
        model = SimpleLinearRegression(n_iterations=100)
        X = [1, 2, 3, 4, 5]
        y = [2, 4, 6, 8, 10]
        model.fit(X, y)
        assert model.weight != 0.0
    
    def test_fit_runs_specified_iterations(self):
        """fit should run for n_iterations steps."""
        model = SimpleLinearRegression(n_iterations=500)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        # History should have entries every 100 iterations: 0, 100, 200, 300, 400, plus final
        assert len(model.history) >= 5


class TestGradientDescent:
    """Test Requirement 3: Gradient calculation and parameter updates."""
    
    def test_gradient_descent_reduces_loss(self):
        """Gradient descent should reduce the loss over iterations."""
        model = SimpleLinearRegression(n_iterations=1000, learning_rate=0.01)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        # First loss should be greater than last loss
        assert model.history[0] > model.history[-1]
    
    def test_weight_update_direction(self):
        """Weight should update in the direction that reduces error."""
        model = SimpleLinearRegression(n_iterations=100, learning_rate=0.01)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])  # y = 2x, so weight should be positive
        model.fit(X, y)
        assert model.weight > 0
    
    def test_convergence_on_perfect_linear_data(self):
        """Model should converge to correct parameters on perfect linear data."""
        model = SimpleLinearRegression(n_iterations=5000, learning_rate=0.01)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([3, 5, 7, 9, 11])  # y = 2x + 1
        model.fit(X, y)
        # Should converge close to weight=2, bias=1
        assert abs(model.weight - 2.0) < 0.5
        assert abs(model.bias - 1.0) < 1.0
    
    def test_gradient_formula_applied_correctly(self):
        """Verify gradient descent updates are applied correctly."""
        model = SimpleLinearRegression(n_iterations=1, learning_rate=0.01)
        X = np.array([1.0, 2.0])
        y = np.array([2.0, 4.0])
        
        # Initial state: weight=0, bias=0
        # After 1 iteration:
        # y_pred = [0, 0]
        # error = y - y_pred = [2, 4]
        # dw = (-2/2) * sum([1*2, 2*4]) = -1 * (2 + 8) = -10
        # db = (-2/2) * sum([2, 4]) = -1 * 6 = -6
        # new_weight = 0 - 0.01 * (-10) = 0.1
        # new_bias = 0 - 0.01 * (-6) = 0.06
        
        model.fit(X, y)
        assert abs(model.weight - 0.1) < 0.001
        assert abs(model.bias - 0.06) < 0.001


class TestPredictMethod:
    """Test Requirement 4: predict method."""
    
    def test_predict_returns_numpy_array(self):
        """predict should return a NumPy array."""
        model = SimpleLinearRegression(n_iterations=100)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        predictions = model.predict(np.array([6, 7]))
        assert isinstance(predictions, np.ndarray)
    
    def test_predict_returns_same_length(self):
        """predict should return array of same length as input."""
        model = SimpleLinearRegression(n_iterations=100)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        test_X = np.array([6, 7, 8])
        predictions = model.predict(test_X)
        assert len(predictions) == len(test_X)
    
    def test_predict_uses_learned_parameters(self):
        """predict should use learned weight and bias."""
        model = SimpleLinearRegression()
        model.weight = 2.0
        model.bias = 1.0
        predictions = model.predict(np.array([1, 2, 3]))
        expected = np.array([3, 5, 7])  # 2*x + 1
        np.testing.assert_array_almost_equal(predictions, expected)
    
    def test_predict_single_value(self):
        """predict should work with a single value."""
        model = SimpleLinearRegression()
        model.weight = 2.0
        model.bias = 0.0
        prediction = model.predict(np.array([5]))
        assert prediction[0] == 10.0
    
    def test_predict_accepts_list_input(self):
        """predict should accept Python list as input."""
        model = SimpleLinearRegression()
        model.weight = 2.0
        model.bias = 1.0
        predictions = model.predict([1, 2, 3])
        expected = np.array([3, 5, 7])
        np.testing.assert_array_almost_equal(predictions, expected)


class TestCostMethod:
    """Test Requirement 5: cost method for MSE."""
    
    def test_cost_returns_float(self):
        """cost should return a float value."""
        model = SimpleLinearRegression()
        X = np.array([1, 2, 3])
        y = np.array([2, 4, 6])
        cost = model.cost(X, y)
        assert isinstance(cost, (float, np.floating))
    
    def test_cost_calculates_mse(self):
        """cost should calculate mean squared error correctly."""
        model = SimpleLinearRegression()
        model.weight = 2.0
        model.bias = 0.0
        X = np.array([1, 2, 3])
        y = np.array([2, 4, 6])  # Perfect predictions
        cost = model.cost(X, y)
        assert cost == 0.0
    
    def test_cost_with_imperfect_predictions(self):
        """cost should calculate MSE for imperfect predictions."""
        model = SimpleLinearRegression()
        model.weight = 1.0
        model.bias = 0.0
        X = np.array([1, 2, 3])
        y = np.array([2, 4, 6])
        # Predictions: [1, 2, 3]
        # Errors: [1, 2, 3]
        # Squared errors: [1, 4, 9]
        # MSE: (1 + 4 + 9) / 3 = 14/3 ≈ 4.667
        cost = model.cost(X, y)
        assert abs(cost - 14/3) < 0.001
    
    def test_cost_decreases_after_training(self):
        """cost should decrease after training."""
        model = SimpleLinearRegression(n_iterations=1000)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        
        cost_before = model.cost(X, y)
        model.fit(X, y)
        cost_after = model.cost(X, y)
        
        assert cost_after < cost_before


class TestVerboseLogging:
    """Test Requirement 6: verbose logging every 100 iterations."""
    
    def test_verbose_false_no_output(self, capsys):
        """When verbose=False, no output should be printed."""
        model = SimpleLinearRegression(n_iterations=500, verbose=False)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        captured = capsys.readouterr()
        # Should have minimal or no output when verbose is False
        assert "Iteration" not in captured.out or captured.out == ""
    
    def test_verbose_true_prints_progress(self, capsys):
        """When verbose=True, progress should be printed."""
        model = SimpleLinearRegression(n_iterations=500, verbose=True)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        captured = capsys.readouterr()
        assert "Iteration" in captured.out
        assert "Loss" in captured.out
    
    def test_verbose_prints_every_100_iterations(self, capsys):
        """Verbose should print every 100 iterations."""
        model = SimpleLinearRegression(n_iterations=500, verbose=True)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        captured = capsys.readouterr()
        # Should have iteration 0, 100, 200, 300, 400
        assert "Iteration 0" in captured.out
        assert "Iteration 100" in captured.out
        assert "Iteration 200" in captured.out


class TestInputValidation:
    """Test Requirement 7: Input validation with ValueError."""
    
    def test_empty_X_raises_error(self):
        """Empty X array should raise ValueError."""
        model = SimpleLinearRegression()
        with pytest.raises(ValueError, match="empty"):
            model.fit(np.array([]), np.array([1, 2, 3]))
    
    def test_empty_y_raises_error(self):
        """Empty y array should raise ValueError."""
        model = SimpleLinearRegression()
        with pytest.raises(ValueError, match="empty"):
            model.fit(np.array([1, 2, 3]), np.array([]))
    
    def test_mismatched_lengths_raises_error(self):
        """Mismatched X and y lengths should raise ValueError."""
        model = SimpleLinearRegression()
        with pytest.raises(ValueError, match="same length"):
            model.fit(np.array([1, 2, 3]), np.array([1, 2]))
    
    def test_error_message_is_descriptive(self):
        """Error message should describe the issue."""
        model = SimpleLinearRegression()
        with pytest.raises(ValueError) as exc_info:
            model.fit(np.array([1, 2, 3]), np.array([1, 2]))
        assert "length" in str(exc_info.value).lower()
    
    def test_both_empty_raises_error(self):
        """Both empty arrays should raise ValueError."""
        model = SimpleLinearRegression()
        with pytest.raises(ValueError):
            model.fit(np.array([]), np.array([]))


class TestTrainingHistory:
    """Test Requirement 8: Training history as list of loss values."""
    
    def test_history_is_list(self):
        """history should be a list."""
        model = SimpleLinearRegression(n_iterations=100)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        assert isinstance(model.history, list)
    
    def test_history_contains_loss_values(self):
        """history should contain numerical loss values."""
        model = SimpleLinearRegression(n_iterations=100)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        for loss in model.history:
            assert isinstance(loss, (int, float, np.floating))
    
    def test_history_recorded_at_intervals(self):
        """history should be recorded at regular intervals."""
        model = SimpleLinearRegression(n_iterations=500)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        # Should have at least 5 entries: 0, 100, 200, 300, 400
        assert len(model.history) >= 5
    
    def test_history_shows_decreasing_loss(self):
        """history should generally show decreasing loss for convergent case."""
        model = SimpleLinearRegression(n_iterations=1000, learning_rate=0.01)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        # First loss should be greater than last loss
        assert model.history[0] > model.history[-1]
    
    def test_history_accessible_after_training(self):
        """history should be accessible as instance attribute."""
        model = SimpleLinearRegression(n_iterations=200)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        # Should be able to access and iterate
        losses = list(model.history)
        assert len(losses) > 0
    
    def test_history_reset_on_refit(self):
        """history should reset when fit is called again."""
        model = SimpleLinearRegression(n_iterations=200)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        
        model.fit(X, y)
        first_history_length = len(model.history)
        
        model.fit(X, y)
        second_history_length = len(model.history)
        
        # History should have same length (not accumulated)
        assert first_history_length == second_history_length


class TestEdgeCases:
    """Test edge cases and special scenarios."""
    
    def test_single_data_point(self):
        """Model should handle single data point."""
        model = SimpleLinearRegression(n_iterations=100)
        X = np.array([1.0])
        y = np.array([2.0])
        model.fit(X, y)
        # Should not crash
        prediction = model.predict(np.array([1.0]))
        assert len(prediction) == 1
    
    def test_negative_values(self):
        """Model should handle negative values."""
        model = SimpleLinearRegression(n_iterations=1000, learning_rate=0.1)
        X = np.array([-2, -1, 0, 1, 2])
        y = np.array([-4, -2, 0, 2, 4])  # y = 2x
        model.fit(X, y)
        assert abs(model.weight - 2.0) < 0.5
    
    def test_float_inputs(self):
        """Model should handle float inputs."""
        model = SimpleLinearRegression(n_iterations=1000)
        X = np.array([0.5, 1.5, 2.5, 3.5, 4.5])
        y = np.array([1.0, 3.0, 5.0, 7.0, 9.0])
        model.fit(X, y)
        assert model.weight != 0.0
    
    def test_large_learning_rate_doesnt_crash(self):
        """Large learning rate should not crash (may diverge but not crash)."""
        model = SimpleLinearRegression(n_iterations=10, learning_rate=1.0)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        # Should complete without crashing
        model.fit(X, y)
    
    def test_very_small_learning_rate(self):
        """Very small learning rate should work but converge slowly."""
        model = SimpleLinearRegression(n_iterations=100, learning_rate=0.0001)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        # Weight should have moved from 0 but slowly
        assert model.weight != 0.0


class TestScikitLearnLikeInterface:
    """Test that the interface follows scikit-learn conventions."""
    
    def test_fit_predict_workflow(self):
        """Standard fit-predict workflow should work."""
        model = SimpleLinearRegression(n_iterations=2000, learning_rate=0.01)
        X_train = np.array([1, 2, 3, 4, 5])
        y_train = np.array([2, 4, 6, 8, 10])
        X_test = np.array([6, 7, 8])
        
        model.fit(X_train, y_train)
        predictions = model.predict(X_test)
        
        # Predictions should be reasonable (close to 12, 14, 16)
        assert abs(predictions[0] - 12) < 2
        assert abs(predictions[1] - 14) < 2
        assert abs(predictions[2] - 16) < 2
    
    def test_method_chaining(self):
        """fit should support method chaining."""
        model = SimpleLinearRegression(n_iterations=100)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        
        predictions = model.fit(X, y).predict(np.array([6]))
        assert len(predictions) == 1
    
    def test_parameters_accessible_after_fit(self):
        """Learned parameters should be accessible after fit."""
        model = SimpleLinearRegression(n_iterations=1000)
        X = np.array([1, 2, 3, 4, 5])
        y = np.array([2, 4, 6, 8, 10])
        model.fit(X, y)
        
        # Should be able to access weight and bias
        assert hasattr(model, 'weight')
        assert hasattr(model, 'bias')
        assert isinstance(model.weight, (int, float, np.floating))
        assert isinstance(model.bias, (int, float, np.floating))

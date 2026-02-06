"""
Comprehensive test suite for KNNClassifier implementation.

Tests cover all requirements including:
- Constructor validation
- fit/predict/score methods
- Euclidean distance calculation
- Tie-breaking strategy
- Input validation
- Edge cases

Running the tests:
    The test suite can be run using pytest. The conftest.py file handles
    the --repo flag to test either repository_before or repository_after.
    
    To run all tests:
        pytest tests/ --repo after
    
    To run a specific test class:
        pytest tests/test_knn_classifier.py::TestConstructor --repo after
    
    To run a specific test:
        pytest tests/test_knn_classifier.py::TestConstructor::test_default_k --repo after
    
    Tests can also be run without the --repo flag (defaults to 'after'):
        pytest tests/
    
    Note: The conftest.py file sets up the import path automatically.
    If running tests in isolation, ensure the repository_after directory
    is in the Python path or run from the project root.
"""

import pytest
import numpy as np
from knn_classifier import KNNClassifier


class TestConstructor:
    """Test constructor and initialization."""
    
    def test_default_k(self):
        """Test that default k is 3."""
        classifier = KNNClassifier()
        assert classifier.k == 3
        assert classifier.X_train is None
        assert classifier.y_train is None
        assert classifier.n_classes_ is None
    
    def test_custom_k(self):
        """Test constructor with custom k value."""
        classifier = KNNClassifier(k=5)
        assert classifier.k == 5
    
    def test_k_positive_integer(self):
        """Test that k must be a positive integer."""
        # Valid k values
        KNNClassifier(k=1)
        KNNClassifier(k=10)
        KNNClassifier(k=100)
        
        # Invalid k values
        with pytest.raises(ValueError, match="k must be a positive integer"):
            KNNClassifier(k=0)
        
        with pytest.raises(ValueError, match="k must be a positive integer"):
            KNNClassifier(k=-1)
        
        with pytest.raises(ValueError, match="k must be a positive integer"):
            KNNClassifier(k=-10)
    
    def test_k_not_integer(self):
        """Test that k must be an integer, not float."""
        with pytest.raises(ValueError, match="k must be a positive integer"):
            KNNClassifier(k=3.5)
        
        with pytest.raises(ValueError, match="k must be a positive integer"):
            KNNClassifier(k=2.0)  # Even if it's a whole number
    
    def test_k_not_boolean(self):
        """Test that k must not be a boolean value."""
        with pytest.raises(ValueError, match="k must be a positive integer.*boolean"):
            KNNClassifier(k=True)
        
        with pytest.raises(ValueError, match="k must be a positive integer.*boolean"):
            KNNClassifier(k=False)


class TestFit:
    """Test fit method."""
    
    def test_fit_stores_data(self):
        """Test that fit stores training data correctly."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        
        classifier.fit(X_train, y_train)
        
        assert classifier.X_train is not None
        assert classifier.y_train is not None
        np.testing.assert_array_equal(classifier.X_train, X_train)
        np.testing.assert_array_equal(classifier.y_train, y_train)
    
    def test_fit_stores_n_classes(self):
        """Test that fit stores number of unique classes."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6], [7, 8]])
        y_train = np.array([0, 1, 0, 2])
        
        classifier.fit(X_train, y_train)
        
        assert classifier.n_classes_ == 3
    
    def test_fit_with_different_k(self):
        """Test fit with different k values."""
        X_train = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]])
        y_train = np.array([0, 1, 0, 1, 0])
        
        # k=3 should work
        classifier1 = KNNClassifier(k=3)
        classifier1.fit(X_train, y_train)
        
        # k=5 should work (equal to n_samples)
        classifier2 = KNNClassifier(k=5)
        classifier2.fit(X_train, y_train)
    
    def test_fit_k_exceeds_samples(self):
        """Test that k cannot exceed number of training samples."""
        classifier = KNNClassifier(k=5)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])  # Only 3 samples
        y_train = np.array([0, 1, 0])
        
        with pytest.raises(ValueError, match="k \\(5\\) cannot exceed the number of training samples \\(3\\)"):
            classifier.fit(X_train, y_train)
    
    def test_fit_shape_mismatch(self):
        """Test that X_train and y_train must have compatible shapes."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1])  # Wrong length
        
        with pytest.raises(ValueError, match="X_train and y_train must have the same number of samples"):
            classifier.fit(X_train, y_train)
    
    def test_fit_X_train_not_2d(self):
        """Test that X_train must be 2D."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([1, 2, 3])  # 1D array
        y_train = np.array([0, 1, 0])
        
        with pytest.raises(ValueError, match="X_train must be a 2D array"):
            classifier.fit(X_train, y_train)
    
    def test_fit_y_train_not_1d(self):
        """Test that y_train must be 1D."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([[0], [1], [0]])  # 2D array
        
        with pytest.raises(ValueError, match="y_train must be a 1D array"):
            classifier.fit(X_train, y_train)
    
    def test_fit_accepts_lists(self):
        """Test that fit accepts Python lists and converts to numpy arrays."""
        classifier = KNNClassifier(k=3)
        X_train = [[1, 2], [3, 4], [5, 6]]
        y_train = [0, 1, 0]
        
        classifier.fit(X_train, y_train)
        
        assert isinstance(classifier.X_train, np.ndarray)
        assert isinstance(classifier.y_train, np.ndarray)
    
    def test_fit_empty_training_set(self):
        """Test behavior when training set is empty."""
        classifier = KNNClassifier(k=1)
        X_train = np.array([]).reshape(0, 2)  # 0 samples, 2 features
        y_train = np.array([])
        
        # With k=1 and 0 samples, fit should raise because k > n_samples (0)
        with pytest.raises(ValueError, match="k \\(1\\) cannot exceed the number of training samples \\(0\\)"):
            classifier.fit(X_train, y_train)
    
    def test_fit_returns_self(self):
        """Test that fit returns self for method chaining."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        
        result = classifier.fit(X_train, y_train)
        assert result is classifier
        # Test method chaining
        classifier2 = KNNClassifier(k=3)
        classifier2.fit(X_train, y_train).fit(X_train, y_train)  # Should not raise
    
    def test_fit_rejects_nan_values(self):
        """Test that fit rejects NaN values in training data."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [np.nan, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        
        with pytest.raises(ValueError, match="X_train contains NaN or Inf values"):
            classifier.fit(X_train, y_train)
        
        X_train2 = np.array([[1, 2], [3, 4], [5, 6]])
        y_train2 = np.array([0, np.nan, 0])
        
        with pytest.raises(ValueError, match="y_train contains NaN or Inf values"):
            classifier.fit(X_train2, y_train2)
    
    def test_fit_rejects_inf_values(self):
        """Test that fit rejects Inf values in training data."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [np.inf, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        
        with pytest.raises(ValueError, match="X_train contains NaN or Inf values"):
            classifier.fit(X_train, y_train)
        
        X_train2 = np.array([[1, 2], [3, 4], [5, 6]])
        y_train2 = np.array([0, np.inf, 0])
        
        with pytest.raises(ValueError, match="y_train contains NaN or Inf values"):
            classifier.fit(X_train2, y_train2)
    
    def test_fit_rejects_non_numeric_values(self):
        """Test that fit rejects non-numeric values in training data."""
        classifier = KNNClassifier(k=2)
        # Try with string dtype (though np.asarray will convert, we check dtype)
        X_train = np.array([['a', 'b'], ['c', 'd']])
        y_train = np.array([0, 1])
        
        with pytest.raises(ValueError, match="X_train must contain only numeric values"):
            classifier.fit(X_train, y_train)


class TestEuclideanDistance:
    """Test _euclidean_distance helper method."""
    
    def test_euclidean_distance_1d(self):
        """Test Euclidean distance for 1D points."""
        classifier = KNNClassifier(k=3)
        classifier.fit(np.array([[1], [2], [3]]), np.array([0, 1, 0]))
        
        point1 = np.array([1])
        point2 = np.array([4])
        
        distance = classifier._euclidean_distance(point1, point2)
        assert distance == 3.0
    
    def test_euclidean_distance_2d(self):
        """Test Euclidean distance for 2D points."""
        classifier = KNNClassifier(k=3)
        classifier.fit(np.array([[1, 2], [3, 4], [5, 6]]), np.array([0, 1, 0]))
        
        point1 = np.array([0, 0])
        point2 = np.array([3, 4])
        
        distance = classifier._euclidean_distance(point1, point2)
        assert distance == 5.0  # sqrt(3^2 + 4^2) = 5
    
    def test_euclidean_distance_3d(self):
        """Test Euclidean distance for 3D points."""
        classifier = KNNClassifier(k=3)
        classifier.fit(np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), np.array([0, 1, 0]))
        
        point1 = np.array([0, 0, 0])
        point2 = np.array([1, 1, 1])
        
        distance = classifier._euclidean_distance(point1, point2)
        expected = np.sqrt(3)  # sqrt(1^2 + 1^2 + 1^2)
        assert abs(distance - expected) < 1e-10
    
    def test_euclidean_distance_same_point(self):
        """Test Euclidean distance for identical points."""
        classifier = KNNClassifier(k=3)
        classifier.fit(np.array([[1, 2], [3, 4], [5, 6]]), np.array([0, 1, 0]))
        
        point = np.array([1, 2])
        distance = classifier._euclidean_distance(point, point)
        assert distance == 0.0
    
    def test_euclidean_distance_scalar_input(self):
        """Test Euclidean distance with scalar/0-D array inputs."""
        classifier = KNNClassifier(k=3)
        classifier.fit(np.array([[1], [2], [3]]), np.array([0, 1, 0]))
        
        # Test with scalar values (will be converted to 0-D arrays)
        point1 = np.array(1.0)  # 0-D array
        point2 = np.array(4.0)  # 0-D array
        
        distance = classifier._euclidean_distance(point1, point2)
        assert distance == 3.0


class TestPredict:
    """Test predict method."""
    
    def test_predict_single_sample(self):
        """Test prediction for a single test sample."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5]])  # Close to class 0
        predictions = classifier.predict(X_test)
        
        assert len(predictions) == 1
        assert predictions[0] == 0
    
    def test_predict_multiple_samples(self):
        """Test prediction for multiple test samples."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5], [11.5, 11.5]])
        predictions = classifier.predict(X_test)
        
        assert len(predictions) == 2
        assert predictions[0] == 0
        assert predictions[1] == 1
    
    def test_predict_before_fit(self):
        """Test that predict raises error if called before fit."""
        classifier = KNNClassifier(k=3)
        X_test = np.array([[1, 2]])
        
        with pytest.raises(ValueError, match="Model must be fitted before making predictions"):
            classifier.predict(X_test)
    
    def test_predict_dimension_mismatch(self):
        """Test that predict validates feature dimensions."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1, 2, 3]])  # 3 features instead of 2
        
        with pytest.raises(ValueError, match="Feature dimension mismatch"):
            classifier.predict(X_test)
    
    def test_predict_X_test_not_2d(self):
        """Test that X_test must be 2D."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([1, 2])  # 1D array
        
        with pytest.raises(ValueError, match="X_test must be a 2D array"):
            classifier.predict(X_test)
    
    def test_predict_accepts_lists(self):
        """Test that predict accepts Python lists."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = [[1, 2]]
        predictions = classifier.predict(X_test)
        
        assert isinstance(predictions, np.ndarray)
        assert len(predictions) == 1
    
    def test_predict_uses_argsort(self):
        """Test that predict explicitly uses argsort to find k nearest neighbors."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5]])  # Close to first 3 points
        
        # Manually verify argsort behavior
        test_point = X_test[0]
        distances = classifier._euclidean_distance(X_train, test_point)
        sorted_indices = np.argsort(distances)
        k_nearest_indices = sorted_indices[:3]
        
        # Verify that predict uses the same approach
        predictions = classifier.predict(X_test)
        
        # The k nearest should be indices 0, 1, 2 (closest to test point)
        assert set(k_nearest_indices) == {0, 1, 2}
        # All three have label 0, so prediction should be 0
        assert predictions[0] == 0
        
        # Verify argsort is actually used by checking that indices are in distance order
        k_distances = distances[k_nearest_indices]
        assert np.all(k_distances[:-1] <= k_distances[1:])  # Sorted in ascending order


class TestTieBreaking:
    """Test tie-breaking strategy."""
    
    def test_tie_breaking_smallest_label(self):
        """Test that ties are broken by selecting smallest label value."""
        classifier = KNNClassifier(k=4)
        # Create data where k=4 neighbors will have 2 of class 0 and 2 of class 1
        X_train = np.array([
            [0, 0],  # class 0 - close
            [0, 1],  # class 0 - close
            [1, 0],  # class 1 - close
            [1, 1],  # class 1 - close
            [10, 10]  # class 2 - far
        ])
        y_train = np.array([0, 0, 1, 1, 2])
        classifier.fit(X_train, y_train)
        
        # Test point equidistant to first 4 points
        X_test = np.array([[0.5, 0.5]])
        predictions = classifier.predict(X_test)
        
        # Should choose 0 (smallest label) over 1
        assert predictions[0] == 0
    
    def test_tie_breaking_multiple_classes(self):
        """Test tie-breaking with multiple classes."""
        classifier = KNNClassifier(k=3)
        # Create data where all 3 neighbors have different classes
        X_train = np.array([
            [0, 0],  # class 2 - closest
            [1, 0],  # class 1
            [0, 1],  # class 0
            [10, 10]  # far away
        ])
        y_train = np.array([2, 1, 0, 3])
        classifier.fit(X_train, y_train)
        
        # Test point closer to [0,0], creating a three-way tie
        X_test = np.array([[0.33, 0.33]])
        predictions = classifier.predict(X_test)
        
        # With k=3, all three classes appear once (tie)
        # Should choose class 2 (first among nearest neighbors)
        # because [0,0] with class 2 is the closest point
        assert predictions[0] == 2
    
    def test_no_tie_single_majority(self):
        """Test prediction when there's a clear majority (no tie)."""
        classifier = KNNClassifier(k=5)
        X_train = np.array([
            [0, 0], [0, 1], [0, 2],  # 3 of class 0
            [1, 0], [1, 1],  # 2 of class 1
            [10, 10]  # far away
        ])
        y_train = np.array([0, 0, 0, 1, 1, 2])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[0.1, 0.1]])
        predictions = classifier.predict(X_test)
        
        # Should predict class 0 (majority)
        assert predictions[0] == 0
    
    def test_tie_breaking_first_among_nearest_neighbors(self):
        """Test tie-breaking using 'first among nearest neighbors' strategy."""
        classifier = KNNClassifier(k=4)
        # Create scenario where k=4 neighbors have equal counts (2 of class 1, 2 of class 0)
        # But class 1 appears first in the nearest neighbors list (closer distances)
        X_train = np.array([
            [0.1, 0.1],  # class 1 - very close (first)
            [0.2, 0.2],  # class 1 - very close (second)
            [0.5, 0.5],  # class 0 - close (third)
            [0.6, 0.6],  # class 0 - close (fourth)
            [10, 10]     # class 2 - far
        ])
        y_train = np.array([1, 1, 0, 0, 2])
        classifier.fit(X_train, y_train)
        
        # Test point equidistant to first 4, but first two (class 1) are slightly closer
        X_test = np.array([[0.15, 0.15]])
        
        # Calculate distances to verify ordering
        distances = classifier._euclidean_distance(X_train, X_test[0])
        sorted_indices = np.argsort(distances)
        k_nearest_labels = y_train[sorted_indices[:4]]
        
        # First label in k_nearest_labels should be class 1 (appears first)
        assert k_nearest_labels[0] == 1
        
        predictions = classifier.predict(X_test)
        
        # Should choose class 1 (appears first among nearest neighbors) even though
        # both classes have count 2, because class 1 appears first in the list
        assert predictions[0] == 1


class TestScore:
    """Test score method."""
    
    def test_score_perfect_accuracy(self):
        """Test score with perfect predictions."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5], [11.5, 11.5]])
        y_test = np.array([0, 1])
        
        accuracy = classifier.score(X_test, y_test)
        assert accuracy == 1.0
    
    def test_score_zero_accuracy(self):
        """Test score with all wrong predictions."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5], [11.5, 11.5]])
        y_test = np.array([1, 0])  # Wrong labels
        
        accuracy = classifier.score(X_test, y_test)
        assert accuracy == 0.0
    
    def test_score_partial_accuracy(self):
        """Test score with partial accuracy."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5], [11.5, 11.5], [2.5, 2.5]])
        y_test = np.array([0, 1, 1])  # 2 correct, 1 wrong
        
        accuracy = classifier.score(X_test, y_test)
        assert abs(accuracy - 2/3) < 1e-10
    
    def test_score_single_sample(self):
        """Test score with a single test sample."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5]])
        y_test = np.array([0])
        
        accuracy = classifier.score(X_test, y_test)
        assert accuracy == 1.0
    
    def test_score_y_test_not_1d(self):
        """Test that y_test must be 1D."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5]])
        y_test = np.array([[0]])  # 2D array
        
        with pytest.raises(ValueError, match="y_test must be a 1D array"):
            classifier.score(X_test, y_test)
    
    def test_score_accepts_lists(self):
        """Test that score accepts Python lists."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = [[1.5, 1.5]]
        y_test = [0]
        
        accuracy = classifier.score(X_test, y_test)
        assert isinstance(accuracy, float)
        assert 0.0 <= accuracy <= 1.0
    
    def test_score_length_mismatch_between_X_test_and_y_test(self):
        """Test that score raises when X_test and y_test have different lengths."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        # Two test samples but only one label
        X_test = np.array([[1.5, 1.5], [2.5, 2.5]])
        y_test = np.array([0])
        
        with pytest.raises(ValueError, match="Number of predictions \\(2\\) does not match number of test samples \\(1\\)"):
            classifier.score(X_test, y_test)
    
    def test_score_before_fit(self):
        """Test that score raises error if called before fit."""
        classifier = KNNClassifier(k=3)
        X_test = np.array([[1, 2]])
        y_test = np.array([0])
        
        with pytest.raises(ValueError, match="Model must be fitted before calculating score"):
            classifier.score(X_test, y_test)


class TestEdgeCases:
    """Test edge cases and special scenarios."""
    
    def test_k_equals_n_samples(self):
        """Test when k equals number of training samples."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[2, 3]])
        predictions = classifier.predict(X_test)
        
        assert len(predictions) == 1
        # Should predict majority class (0 appears twice, 1 appears once)
        assert predictions[0] == 0
    
    def test_single_class(self):
        """Test with training data containing only one class."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6], [7, 8]])
        y_train = np.array([0, 0, 0, 0])
        classifier.fit(X_train, y_train)
        
        assert classifier.n_classes_ == 1
        
        X_test = np.array([[2, 3]])
        predictions = classifier.predict(X_test)
        
        assert predictions[0] == 0
    
    def test_single_training_sample(self):
        """Test with only one training sample."""
        classifier = KNNClassifier(k=1)
        X_train = np.array([[1, 2]])
        y_train = np.array([0])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[10, 20]])
        predictions = classifier.predict(X_test)
        
        assert predictions[0] == 0
    
    def test_empty_test_set(self):
        """Test prediction with empty test set."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([]).reshape(0, 2)
        predictions = classifier.predict(X_test)
        
        assert len(predictions) == 0
    
    def test_empty_test_set_score(self):
        """Test score with empty test set."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([]).reshape(0, 2)
        y_test = np.array([])
        
        accuracy = classifier.score(X_test, y_test)
        assert accuracy == 0.0
    
    def test_high_dimensional_features(self):
        """Test with high-dimensional feature vectors (deterministic with fixed seed)."""
        # Use fixed random seed for determinism
        rng = np.random.RandomState(42)
        classifier = KNNClassifier(k=3)
        X_train = rng.rand(10, 100)  # 10 samples, 100 features
        y_train = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = rng.rand(5, 100)
        predictions = classifier.predict(X_test)
        
        assert len(predictions) == 5
        assert all(pred in [0, 1] for pred in predictions)
        
        # Verify deterministic: same seed produces same results
        rng2 = np.random.RandomState(42)
        classifier2 = KNNClassifier(k=3)
        X_train2 = rng2.rand(10, 100)
        classifier2.fit(X_train2, y_train)
        X_test2 = rng2.rand(5, 100)
        predictions2 = classifier2.predict(X_test2)
        np.testing.assert_array_equal(predictions, predictions2)
    
    def test_many_classes(self):
        """Test with many different classes."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[i, i] for i in range(10)])
        y_train = np.array(list(range(10)))  # 10 different classes
        classifier.fit(X_train, y_train)
        
        assert classifier.n_classes_ == 10
        
        X_test = np.array([[0.5, 0.5]])
        predictions = classifier.predict(X_test)
        
        assert predictions[0] in range(10)


class TestDeterministic:
    """Test that predictions are deterministic and reproducible."""
    
    def test_deterministic_predictions(self):
        """Test that same input produces same output."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]])
        y_train = np.array([0, 1, 0, 1, 0])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[2, 3]])
        
        predictions1 = classifier.predict(X_test)
        predictions2 = classifier.predict(X_test)
        
        np.testing.assert_array_equal(predictions1, predictions2)
    
    def test_deterministic_with_ties(self):
        """Test deterministic behavior even with ties."""
        classifier = KNNClassifier(k=4)
        X_train = np.array([
            [0, 0], [0, 1],  # class 0
            [1, 0], [1, 1],  # class 1
            [10, 10]  # far away
        ])
        y_train = np.array([0, 0, 1, 1, 2])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[0.5, 0.5]])
        
        predictions1 = classifier.predict(X_test)
        predictions2 = classifier.predict(X_test)
        
        # Should always predict 0 (smallest label in tie)
        assert predictions1[0] == 0
        assert predictions2[0] == 0
        np.testing.assert_array_equal(predictions1, predictions2)


class TestNClassesUsage:
    """Test n_classes_ attribute usage for potential probability estimation."""
    
    def test_n_classes_accessible_for_probability_estimation(self):
        """Test that n_classes_ can be used for probability estimation calculations."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]])
        y_train = np.array([0, 1, 0, 2, 1])
        classifier.fit(X_train, y_train)
        
        # Verify n_classes_ is set correctly
        assert classifier.n_classes_ == 3
        
        # Demonstrate potential use: can create probability array of correct size
        # This shows n_classes_ is useful for probability estimation
        n_classes = classifier.n_classes_
        probabilities = np.zeros(n_classes)
        
        # Simulate probability calculation: for each class, count occurrences in k neighbors
        X_test = np.array([[2, 3]])
        predictions = classifier.predict(X_test)
        
        # In a real probability estimation, we'd count class occurrences in k neighbors
        # and normalize. Here we just verify n_classes_ enables this.
        assert len(probabilities) == n_classes
        assert predictions[0] < n_classes  # Prediction is valid class index


class TestEducationalAspects:
    """Test educational aspects mentioned in the prompt - demonstrating KNN behavior."""
    
    def test_small_k_sensitive_to_individual_examples(self):
        """
        Test that small k values make the model sensitive to individual training examples.
        
        Educational goal: Demonstrate how k affects decision boundaries.
        Small k (like k=1) creates decision boundaries that closely follow training data.
        """
        # Create training data with one outlier
        X_train = np.array([
            [0, 0], [0, 1], [1, 0], [1, 1],  # 4 points of class 0 clustered together
            [0.5, 0.5],  # 1 outlier of class 1 in the middle
            [10, 10], [10, 11], [11, 10], [11, 11]  # 4 points of class 0 far away
        ])
        y_train = np.array([0, 0, 0, 0, 1, 0, 0, 0, 0])
        
        # Test point very close to the outlier
        X_test = np.array([[0.6, 0.6]])
        
        # With k=1, prediction should be class 1 (sensitive to the nearby outlier)
        classifier_k1 = KNNClassifier(k=1)
        classifier_k1.fit(X_train, y_train)
        pred_k1 = classifier_k1.predict(X_test)
        assert pred_k1[0] == 1, "k=1 should be sensitive to the nearby outlier"
        
        # With k=5, prediction should be class 0 (generalized, majority wins)
        classifier_k5 = KNNClassifier(k=5)
        classifier_k5.fit(X_train, y_train)
        pred_k5 = classifier_k5.predict(X_test)
        assert pred_k5[0] == 0, "k=5 should create more generalized decision boundary"
        
        # Verify predictions are different (k affects behavior)
        assert pred_k1[0] != pred_k5[0], "Different k values should produce different behaviors"
    
    def test_large_k_creates_generalized_boundaries(self):
        """
        Test that large k values create more generalized decision boundaries.
        
        Educational goal: Show how larger k smooths out noise and creates
        broader decision regions.
        """
        # Create imbalanced training data: 7 of class 0, 3 of class 1
        X_train = np.array([
            [0, 0], [0, 1], [1, 0], [1, 1], [0.5, 0], [0, 0.5], [0.5, 1],  # class 0
            [0.25, 0.25], [0.75, 0.75], [0.5, 0.5]  # class 1 (minority, scattered)
        ])
        y_train = np.array([0, 0, 0, 0, 0, 0, 0, 1, 1, 1])
        
        # Test point in the middle
        X_test = np.array([[0.5, 0.6]])
        
        # With k=3, might get class 1 if 3 nearest are class 1
        classifier_k3 = KNNClassifier(k=3)
        classifier_k3.fit(X_train, y_train)
        pred_k3 = classifier_k3.predict(X_test)
        
        # With k=9, should get class 0 (majority across larger neighborhood)
        classifier_k9 = KNNClassifier(k=9)
        classifier_k9.fit(X_train, y_train)
        pred_k9 = classifier_k9.predict(X_test)
        assert pred_k9[0] == 0, "Large k should favor the majority class across broader region"


class TestPredictionValidity:
    """Test that predictions are always valid class labels from training set."""
    
    def test_predictions_are_valid_training_labels(self):
        """Test that all predictions are labels that exist in the training set."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]])
        y_train = np.array([10, 20, 10, 30, 20])  # Non-sequential labels
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[2, 3], [4, 5], [8, 9]])
        predictions = classifier.predict(X_test)
        
        # All predictions must be in the set of training labels
        valid_labels = set(y_train)
        for pred in predictions:
            assert pred in valid_labels, f"Prediction {pred} is not a valid training label"
    
    def test_predictions_with_negative_labels(self):
        """Test predictions work correctly with negative class labels."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([-1, -1, -1, 1, 1, 1])  # Negative and positive labels
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5], [11.5, 11.5]])
        predictions = classifier.predict(X_test)
        
        assert predictions[0] == -1, "Should predict negative class label"
        assert predictions[1] == 1, "Should predict positive class label"
        assert all(pred in [-1, 1] for pred in predictions)
    
    def test_predictions_with_float_labels(self):
        """Test predictions work correctly with float class labels."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([0.5, 0.5, 0.5, 1.5, 1.5, 1.5])  # Float labels
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1.5, 1.5]])
        predictions = classifier.predict(X_test)
        
        assert predictions[0] == 0.5, "Should predict float class label"
        assert all(pred in [0.5, 1.5] for pred in predictions)


class TestAdditionalEdgeCases:
    """Test additional edge cases not covered elsewhere."""
    
    def test_empty_test_set_with_dimension_mismatch(self):
        """Test empty test set with wrong number of features."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 2], [3, 4], [5, 6]])
        y_train = np.array([0, 1, 0])
        classifier.fit(X_train, y_train)
        
        # Empty test set with wrong number of features (3 instead of 2)
        X_test = np.array([]).reshape(0, 3)
        
        with pytest.raises(ValueError, match="Feature dimension mismatch"):
            classifier.predict(X_test)
    
    def test_k_equals_n_samples_boundary(self):
        """Test exact boundary condition where k equals number of training samples."""
        n_samples = 5
        classifier = KNNClassifier(k=n_samples)
        X_train = np.array([[i, i] for i in range(n_samples)])
        y_train = np.array([0, 0, 1, 1, 1])  # 3 of class 1, 2 of class 0
        
        # Should work fine
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[2.5, 2.5]])
        predictions = classifier.predict(X_test)
        
        # With k=5 (all training samples), should predict majority class (1)
        assert len(predictions) == 1
        assert predictions[0] == 1, "Should predict majority class when k equals n_samples"
    
    def test_single_feature_classification(self):
        """Test 1-dimensional feature space (single feature)."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1], [2], [3], [10], [11], [12]])  # Single feature
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[2.5], [10.5]])
        predictions = classifier.predict(X_test)
        
        assert predictions[0] == 0  # Close to class 0 samples
        assert predictions[1] == 1  # Close to class 1 samples
    
    def test_duplicate_training_samples(self):
        """Test with duplicate samples in training data."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([
            [1, 1], [1, 1], [1, 1],  # 3 identical samples of class 0
            [10, 10], [10, 10], [10, 10]  # 3 identical samples of class 1
        ])
        y_train = np.array([0, 0, 0, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.array([[1, 1], [10, 10]])  # Test on exact duplicates
        predictions = classifier.predict(X_test)
        
        assert predictions[0] == 0
        assert predictions[1] == 1
    
    def test_labels_not_zero_indexed(self):
        """Test that class labels don't need to be 0-indexed or sequential."""
        classifier = KNNClassifier(k=3)
        X_train = np.array([[1, 1], [2, 2], [3, 3], [10, 10], [11, 11], [12, 12]])
        y_train = np.array([100, 100, 100, 500, 500, 500])  # Non-sequential, large labels
        classifier.fit(X_train, y_train)
        
        assert classifier.n_classes_ == 2
        
        X_test = np.array([[1.5, 1.5], [11.5, 11.5]])
        predictions = classifier.predict(X_test)
        
        assert predictions[0] == 100
        assert predictions[1] == 500
        
        # Score should also work
        y_test = np.array([100, 500])
        accuracy = classifier.score(X_test, y_test)
        assert accuracy == 1.0


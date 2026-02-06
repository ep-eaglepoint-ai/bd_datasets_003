"""
Comprehensive test suite for KNNClassifier implementation.

Tests cover all requirements including:
- Constructor validation
- fit/predict/score methods
- Euclidean distance calculation
- Tie-breaking strategy
- Input validation
- Edge cases
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
            [0, 0],  # class 2
            [1, 0],  # class 1
            [0, 1],  # class 0
            [10, 10]  # far away
        ])
        y_train = np.array([2, 1, 0, 3])
        classifier.fit(X_train, y_train)
        
        # Test point equidistant to first 3 points
        X_test = np.array([[0.33, 0.33]])
        predictions = classifier.predict(X_test)
        
        # Should choose 0 (smallest label) among 0, 1, 2
        assert predictions[0] == 0
    
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
        """Test with high-dimensional feature vectors."""
        classifier = KNNClassifier(k=3)
        X_train = np.random.rand(10, 100)  # 10 samples, 100 features
        y_train = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
        classifier.fit(X_train, y_train)
        
        X_test = np.random.rand(5, 100)
        predictions = classifier.predict(X_test)
        
        assert len(predictions) == 5
        assert all(pred in [0, 1] for pred in predictions)
    
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


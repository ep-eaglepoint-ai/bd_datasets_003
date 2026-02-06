"""
K-Nearest Neighbors (KNN) Classifier Implementation

A simple, educational implementation of the KNN algorithm for classification.
This implementation is designed to be readable and understandable for students
learning machine learning fundamentals.
"""

from typing import Union
import numpy as np
from collections import Counter


class KNNClassifier:
    """
    K-Nearest Neighbors classifier for multi-class classification.
    
    This is a lazy learning algorithm that stores all training data and
    performs distance calculations at prediction time.
    
    Attributes:
        k (int): Number of neighbors to consider for classification.
        X_train (np.ndarray): Training feature vectors (2D array).
        y_train (np.ndarray): Training class labels (1D array).
        n_classes_ (int): Number of unique classes in training data.
    """
    
    def __init__(self, k: int = 3) -> None:
        """
        Initialize the KNN classifier.
        
        Args:
            k (int): Number of neighbors to consider (default: 3).
                    Must be a positive integer.
        
        Raises:
            ValueError: If k is not a positive integer.
        """
        if not isinstance(k, int) or k <= 0:
            raise ValueError(f"k must be a positive integer, got {k}")
        
        self.k: int = k
        self.X_train: Union[np.ndarray, None] = None
        self.y_train: Union[np.ndarray, None] = None
        self.n_classes_: Union[int, None] = None
    
    def fit(self, X_train: Union[np.ndarray, list], y_train: Union[np.ndarray, list]) -> None:
        """
        Store training data for later use in prediction.
        
        Since KNN is a lazy learner, no actual training computation
        happens here - we just store the data.
        
        Args:
            X_train (np.ndarray): Training feature vectors (2D array).
                                 Shape: (n_samples, n_features)
            y_train (np.ndarray): Training class labels (1D array).
                                 Shape: (n_samples,)
        
        Raises:
            ValueError: If k exceeds the number of training samples.
            ValueError: If X_train and y_train have incompatible shapes.
        """
        # Convert to numpy arrays if not already
        X_train = np.asarray(X_train)
        y_train = np.asarray(y_train)
        
        # Validate input shapes
        if X_train.ndim != 2:
            raise ValueError(f"X_train must be a 2D array, got {X_train.ndim}D array")
        
        if y_train.ndim != 1:
            raise ValueError(f"y_train must be a 1D array, got {y_train.ndim}D array")
        
        n_samples = X_train.shape[0]
        if n_samples != y_train.shape[0]:
            raise ValueError(
                f"X_train and y_train must have the same number of samples. "
                f"Got X_train: {n_samples}, y_train: {y_train.shape[0]}"
            )
        
        # Validate that k does not exceed number of training samples
        if self.k > n_samples:
            raise ValueError(
                f"k ({self.k}) cannot exceed the number of training samples ({n_samples})"
            )
        
        # Store training data
        self.X_train = X_train
        self.y_train = y_train
        
        # Store number of unique classes
        self.n_classes_: int = len(np.unique(y_train))
    
    def _euclidean_distance(self, point1: np.ndarray, point2: np.ndarray) -> Union[float, np.ndarray]:
        """
        Calculate the Euclidean distance between two points.
        
        Formula: sqrt(sum((x1 - x2)^2)) for each dimension.
        
        Args:
            point1 (np.ndarray): First point (can be 1D or 2D).
            point2 (np.ndarray): Second point (can be 1D or 2D).
        
        Returns:
            float or np.ndarray: Euclidean distance(s) between the points.
        """
        return np.sqrt(np.sum((point1 - point2) ** 2, axis=-1))
    
    def predict(self, X_test: Union[np.ndarray, list]) -> np.ndarray:
        """
        Predict class labels for test samples.
        
        For each test sample:
        1. Calculate distances to all training samples
        2. Find k nearest neighbors
        3. Determine majority class among neighbors
        4. Handle ties by selecting the class with smallest label value
        
        Args:
            X_test (np.ndarray): Test feature vectors (2D array).
                                Shape: (n_samples, n_features)
        
        Returns:
            np.ndarray: Predicted class labels (1D array).
                       Shape: (n_samples,)
        
        Raises:
            ValueError: If model has not been fitted.
            ValueError: If feature dimensions don't match training data.
        """
        if self.X_train is None or self.y_train is None:
            raise ValueError("Model must be fitted before making predictions. Call fit() first.")
        
        # Convert to numpy array if not already
        X_test = np.asarray(X_test)
        
        # Validate input shape
        if X_test.ndim != 2:
            raise ValueError(f"X_test must be a 2D array, got {X_test.ndim}D array")
        
        # Validate feature dimensions match
        n_features_train = self.X_train.shape[1]
        n_features_test = X_test.shape[1]
        
        if n_features_test != n_features_train:
            raise ValueError(
                f"Feature dimension mismatch: X_test has {n_features_test} features, "
                f"but training data has {n_features_train} features"
            )
        
        predictions = []
        
        # For each test sample
        for test_point in X_test:
            # Calculate distances to all training points
            distances = self._euclidean_distance(self.X_train, test_point)
            
            # Find indices of k smallest distances using argsort
            k_nearest_indices = np.argsort(distances)[:self.k]
            
            # Get labels of k nearest neighbors
            k_nearest_labels = self.y_train[k_nearest_indices]
            
            # Count occurrences of each class
            label_counts = Counter(k_nearest_labels)
            
            # Find the maximum count
            max_count = max(label_counts.values())
            
            # Get all classes with maximum count (handle ties)
            tied_classes = [label for label, count in label_counts.items() if count == max_count]
            
            # Tie-breaking strategy: select the class with the smallest label value
            # This ensures deterministic and reproducible predictions
            predicted_label = min(tied_classes)
            
            predictions.append(predicted_label)
        
        return np.array(predictions)
    
    def score(self, X_test: Union[np.ndarray, list], y_test: Union[np.ndarray, list]) -> float:
        """
        Calculate classification accuracy on test data.
        
        Accuracy is defined as the proportion of correct predictions:
        accuracy = (number of correct predictions) / (total predictions)
        
        Args:
            X_test (np.ndarray): Test feature vectors (2D array).
            y_test (np.ndarray): True class labels (1D array).
        
        Returns:
            float: Classification accuracy between 0 and 1.
        
        Raises:
            ValueError: If X_test and y_test have incompatible shapes.
        """
        # Convert to numpy arrays if not already
        y_test = np.asarray(y_test)
        
        # Validate input shapes
        if y_test.ndim != 1:
            raise ValueError(f"y_test must be a 1D array, got {y_test.ndim}D array")
        
        # Make predictions
        predictions = self.predict(X_test)
        
        # Validate that predictions and y_test have same length
        if len(predictions) != len(y_test):
            raise ValueError(
                f"Number of predictions ({len(predictions)}) does not match "
                f"number of test samples ({len(y_test)})"
            )
        
        # Calculate accuracy
        correct_predictions = np.sum(predictions == y_test)
        total_predictions = len(y_test)
        
        accuracy = correct_predictions / total_predictions if total_predictions > 0 else 0.0
        
        return float(accuracy)


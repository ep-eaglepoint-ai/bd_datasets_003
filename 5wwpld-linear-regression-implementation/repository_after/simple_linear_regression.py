"""
Simple Linear Regression Implementation using Gradient Descent

This module provides a SimpleLinearRegression class that performs single-variable
linear regression using gradient descent optimization. Designed as an educational
tool to help students understand the fundamentals of machine learning.
"""

import numpy as np


class SimpleLinearRegression:
    """
    A simple linear regression model using gradient descent optimization.
    
    This class implements single-variable linear regression from scratch,
    learning to predict a continuous target variable from a single input feature
    by finding the optimal slope (weight) and intercept (bias) values that
    minimize the mean squared error.
    
    Parameters
    ----------
    learning_rate : float, default=0.01
        The step size for gradient descent updates. Controls how much the
        parameters change in each iteration.
    n_iterations : int, default=1000
        The number of gradient descent iterations to perform during training.
    verbose : bool, default=False
        If True, print the loss value every 100 iterations during training.
    
    Attributes
    ----------
    weight : float
        The learned slope parameter after fitting.
    bias : float
        The learned intercept parameter after fitting.
    history : list
        List of loss values recorded during training at regular intervals.
    
    Examples
    --------
    >>> import numpy as np
    >>> X = np.array([1, 2, 3, 4, 5])
    >>> y = np.array([2, 4, 6, 8, 10])
    >>> model = SimpleLinearRegression(learning_rate=0.01, n_iterations=1000)
    >>> model.fit(X, y)
    >>> model.predict(np.array([6]))
    array([12.])
    """
    
    def __init__(self, learning_rate=0.01, n_iterations=1000, verbose=False):
        """
        Initialize the SimpleLinearRegression model.
        
        Parameters
        ----------
        learning_rate : float, default=0.01
            The step size for gradient descent updates.
        n_iterations : int, default=1000
            The number of gradient descent iterations.
        verbose : bool, default=False
            Whether to print training progress.
        """
        self.learning_rate = learning_rate
        self.n_iterations = n_iterations
        self.verbose = verbose
        
        # Initialize parameters to zero
        self.weight = 0.0
        self.bias = 0.0
        
        # Training history for loss values
        self.history = []
    
    def _validate_input(self, X, y):
        """
        Validate input arrays for training.
        
        Parameters
        ----------
        X : array-like
            Input features.
        y : array-like
            Target values.
        
        Raises
        ------
        ValueError
            If X or y are empty, or if they have different lengths.
        """
        # Convert to numpy arrays if not already
        X = np.asarray(X)
        y = np.asarray(y)
        
        # Check for empty arrays
        if X.size == 0:
            raise ValueError("Input array X cannot be empty.")
        if y.size == 0:
            raise ValueError("Target array y cannot be empty.")
        
        # Check for matching lengths
        if len(X) != len(y):
            raise ValueError(
                f"X and y must have the same length. "
                f"Got X with length {len(X)} and y with length {len(y)}."
            )
        
        return X.astype(float), y.astype(float)
    
    def fit(self, X, y):
        """
        Fit the linear regression model using gradient descent.
        
        This method runs gradient descent for n_iterations steps, updating
        the weight and bias at each step to minimize mean squared error.
        
        Parameters
        ----------
        X : array-like of shape (n_samples,)
            Training input features as a 1D array.
        y : array-like of shape (n_samples,)
            Target values as a 1D array.
        
        Returns
        -------
        self : SimpleLinearRegression
            Returns the instance itself for method chaining.
        
        Raises
        ------
        ValueError
            If X and y have different lengths or are empty.
        """
        # Validate and convert inputs
        X, y = self._validate_input(X, y)
        
        # Number of samples
        n = len(X)
        
        # Reset parameters
        self.weight = 0.0
        self.bias = 0.0
        self.history = []
        
        # Gradient descent loop
        for i in range(self.n_iterations):
            # Compute predictions: y_pred = X * weight + bias
            y_pred = X * self.weight + self.bias
            
            # Compute gradients
            # dw = (-2/n) * sum(X * (y - y_pred))
            # db = (-2/n) * sum(y - y_pred)
            dw = (-2 / n) * np.sum(X * (y - y_pred))
            db = (-2 / n) * np.sum(y - y_pred)
            
            # Update parameters
            self.weight = self.weight - self.learning_rate * dw
            self.bias = self.bias - self.learning_rate * db
            
            # Record loss every 100 iterations (and at iteration 0)
            if i % 100 == 0:
                loss = self.cost(X, y)
                self.history.append(loss)
                
                if self.verbose:
                    print(f"Iteration {i}: Loss = {loss:.6f}")
        
        # Record final loss
        final_loss = self.cost(X, y)
        if self.n_iterations % 100 != 0:
            self.history.append(final_loss)
        
        if self.verbose:
            print(f"Training complete. Final Loss = {final_loss:.6f}")
        
        return self
    
    def predict(self, X):
        """
        Make predictions using the learned weight and bias.
        
        Parameters
        ----------
        X : array-like of shape (n_samples,)
            Input features for prediction.
        
        Returns
        -------
        y_pred : ndarray of shape (n_samples,)
            Predicted values.
        """
        X = np.asarray(X, dtype=float)
        return X * self.weight + self.bias
    
    def cost(self, X, y):
        """
        Calculate the mean squared error between predictions and actual values.
        
        This is the objective function being minimized during training.
        
        Parameters
        ----------
        X : array-like of shape (n_samples,)
            Input features.
        y : array-like of shape (n_samples,)
            Actual target values.
        
        Returns
        -------
        mse : float
            The mean squared error.
        """
        X = np.asarray(X, dtype=float)
        y = np.asarray(y, dtype=float)
        
        y_pred = self.predict(X)
        mse = np.mean((y - y_pred) ** 2)
        return mse

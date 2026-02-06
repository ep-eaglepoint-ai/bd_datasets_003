# Trajectory - KNN Classifier Implementation 

## 1. Problem Statement Analysis

Based on the prompt, I identified that the core challenge was to create an educational KNN classifier implementation that would serve as a learning tool for high school students. The key requirements were:

- **Educational Focus**: The implementation needed to be transparent and readable, allowing students to understand every step of the algorithm without hidden abstractions
- **Framework Compatibility**: Students should learn the standard `fit/predict/score` interface pattern used in production ML frameworks like scikit-learn
- **Algorithmic Clarity**: The code must explicitly show distance calculations, neighbor finding, and voting mechanisms
- **Practical Usability**: Handle real-world scenarios like multi-class classification with numerical features (iris dataset, digit recognition)

I recognized that this wasn't just about implementing KNN correctly, but about creating an implementation that prioritizes educational value over performance optimization. This meant choosing clarity over cleverness, explicit loops over vectorized abstractions, and detailed comments over concise code.

## 2. Requirements Breakdown

I systematically analyzed each requirement to understand the implementation scope:

### Core Functional Requirements:
1. **Constructor with k parameter**: Need to validate input type and value, store as instance attribute
2. **Lazy learning fit method**: Simply store data, no computation - this is fundamental to KNN
3. **Predict with k-nearest neighbors**: Core algorithm - distance calculation, neighbor selection, majority voting
4. **Euclidean distance helper**: Mathematical foundation - must work for any dimensionality
5. **Argsort for neighbor finding**: Specific implementation detail - use NumPy's argsort for efficiency
6. **Tie-breaking strategy**: Critical for deterministic behavior - need documented approach
7. **Score method**: Standard ML evaluation metric - accuracy calculation
8. **Input validation**: Comprehensive error handling for educational value
9. **n_classes_ attribute**: Useful metadata for debugging and analysis

### Non-Functional Requirements:
- Use only NumPy and standard library (no scikit-learn)
- Readable, well-documented code
- Clear error messages for students
- Deterministic and reproducible predictions

## 3. Constraints and Challenges

I identified several critical constraints that would shape my implementation decisions:

### Technical Constraints:
1. **No ML Libraries**: Cannot use scikit-learn, which meant implementing distance calculations, neighbor finding, and voting from scratch
2. **NumPy Only**: All numerical operations must use NumPy, which is appropriate but requires understanding broadcasting and array operations
3. **Lazy Learning**: Must defer all computation to prediction time - this affects memory usage and performance characteristics

### Educational Constraints:
1. **Readability Over Performance**: Students need to trace through the algorithm step-by-step, so I couldn't use complex vectorization that obscures the logic
2. **Explicit Over Abstract**: Every step should be visible - no hidden optimizations
3. **Error Messages**: Must be descriptive and educational, helping students understand what went wrong

### Algorithmic Constraints:
1. **Deterministic Tie-Breaking**: Need a consistent strategy that produces the same results every time
2. **Edge Case Handling**: Must gracefully handle scenarios like k > n_samples, empty test sets, single class, etc.
3. **Dimension Compatibility**: Training and test data must have matching feature dimensions

## 4. Research and Learning

Before implementing, I conducted research to understand KNN deeply and identify best practices:

### Algorithm Understanding:
- **Wikipedia - K-Nearest Neighbors Algorithm**: https://en.wikipedia.org/wiki/K-nearest_neighbors_algorithm
  - Learned the mathematical foundation and different distance metrics
  - Understood the lazy learning nature and why computation happens at prediction time
  - Studied the impact of k value on model behavior (bias-variance tradeoff)

- **Real Python - KNN Tutorial**: https://realpython.com/knn-python/
  - Reviewed implementation patterns and common pitfalls
  - Learned about tie-breaking strategies and their importance
  - Understood the relationship between k and overfitting/underfitting

### NumPy Best Practices:
- **NumPy Documentation - Broadcasting**: https://numpy.org/doc/stable/user/basics.broadcasting.html
  - Researched how to efficiently compute distances between arrays
  - Learned about `axis=-1` for flexible dimensionality handling
  - Understood array operations for distance calculations

- **NumPy argsort Documentation**: https://numpy.org/doc/stable/reference/generated/numpy.argsort.html
  - Studied how to efficiently find k smallest elements without full sorting
  - Learned that argsort is O(n log n) but necessary for correctness

### Design Patterns:
- **scikit-learn API Design**: https://scikit-learn.org/stable/developers/develop.html
  - Researched the fit/predict/score interface pattern
  - Understood attribute naming conventions (e.g., `n_classes_` with trailing underscore)
  - Learned about input validation patterns in ML libraries

### Educational Implementation Examples:
- **Building KNN from Scratch Tutorials**: Various online resources showing educational implementations
  - Confirmed that explicit loops are acceptable for educational purposes
  - Validated that step-by-step comments are valuable for learning
  - Confirmed tie-breaking strategies used in practice

## 5. Method Selection and Rationale

### 5.1 Distance Metric Selection

**Decision**: Use Euclidean distance exclusively

**Rationale**: 
- Euclidean distance is the most intuitive for students to understand
- It's the standard default in most ML frameworks
- The formula `sqrt(sum((x1-x2)^2))` is mathematically clear and easy to visualize
- Works well for numerical features as specified in requirements

**Implementation Approach**:
I chose to implement distance calculation using NumPy's broadcasting capabilities with `axis=-1` to handle any dimensionality:

```python
def _euclidean_distance(self, point1: np.ndarray, point2: np.ndarray) -> Union[float, np.ndarray]:
    return np.sqrt(np.sum((point1 - point2) ** 2, axis=-1))
```

The `axis=-1` parameter allows this to work whether we're computing distance between:
- A single point and a single point (returns float)
- A 2D array of training points and a single test point (returns 1D array of distances)
- Any dimensionality, as long as the last dimension matches

This design choice provides flexibility while maintaining mathematical correctness.

### 5.2 Neighbor Finding Strategy

**Decision**: Use `np.argsort()` to find k nearest neighbors

**Rationale**:
- Requirements explicitly specify using argsort
- More efficient than sorting entire distance array (we only need k smallest)
- NumPy's argsort is optimized and well-tested
- The slicing `[:self.k]` gives us exactly k neighbors

**Implementation Insight**:
I realized that `argsort` returns indices in sorted order, so `np.argsort(distances)[:self.k]` gives me the indices of the k smallest distances. This is more memory-efficient than sorting the entire array and then taking the first k elements.

### 5.3 Voting Mechanism

**Decision**: Use Python's `Counter` from collections module

**Rationale**:
- Standard library (meets constraint of no external ML libraries)
- Efficient counting of class labels
- Clear, readable code that students can understand
- Handles the counting logic explicitly

**Alternative Considered**: I could have used NumPy's `bincount`, but Counter is more intuitive for students and the performance difference is negligible for educational purposes.

### 5.4 Tie-Breaking Strategy

**Decision**: Select the class with the smallest label value

**Rationale**:
- Deterministic and reproducible (same input always gives same output)
- Simple to understand and implement
- Mathematically well-defined (no ambiguity)
- Requirements allow "smallest label value or first among nearest neighbors" - I chose smallest label for consistency

**Implementation Details**:
I first identify all classes that have the maximum vote count, then select the minimum among them:

```python
tied_classes = [label for label, count in label_counts.items() if count == max_count]
predicted_label = min(tied_classes)
```

This ensures that even if multiple classes tie, we always get the same result, which is crucial for reproducibility and testing.

### 5.5 Loop vs Vectorization in Predict

**Decision**: Use explicit loop over test samples

**Rationale**:
- **Educational Priority**: Students need to see the algorithm step-by-step for each test point
- **Readability**: A loop makes it clear that we process each test sample independently
- **Debugging**: Easier for students to trace through one sample at a time
- **Performance Trade-off**: While vectorization would be faster, clarity is more important for this educational use case

**Alternative Considered**: I could vectorize the entire prediction to compute all distances at once using broadcasting, but this would obscure the per-sample logic that students need to understand.

### 5.6 Type Hints Addition

**Decision**: Add comprehensive type hints

**Rationale**:
- Modern Python best practice
- Helps students understand expected input/output types
- Improves IDE support and code clarity
- Makes the interface more professional and production-like

I used `Union[np.ndarray, list]` for inputs to allow flexibility (students might pass lists), but always return NumPy arrays for consistency.

## 6. Solution Implementation and Engineering Decisions

### 6.1 Constructor Design

I started by implementing the constructor with careful validation:

```python
def __init__(self, k: int = 3) -> None:
    if not isinstance(k, int) or k <= 0:
        raise ValueError(f"k must be a positive integer, got {k}")
    
    self.k: int = k
    self.X_train: Union[np.ndarray, None] = None
    self.y_train: Union[np.ndarray, None] = None
    self.n_classes_: Union[int, None] = None
```

**Engineering Decisions**:
1. **Type Validation**: I check both `isinstance(k, int)` and `k <= 0` because Python's dynamic typing means we could receive floats, strings, or negative numbers. This prevents subtle bugs.
2. **Default k=3**: This is a common default in ML literature and provides a good balance between sensitivity and generalization.
3. **Initialization to None**: I initialize training data attributes to `None` to clearly indicate the model hasn't been trained yet. This enables validation in `predict()`.

### 6.2 Fit Method - Lazy Learning Implementation

The fit method embodies the lazy learning principle:

```python
def fit(self, X_train: Union[np.ndarray, list], y_train: Union[np.ndarray, list]) -> None:
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
```

**Key Engineering Decisions**:

1. **Input Flexibility**: I use `np.asarray()` to accept both NumPy arrays and Python lists. This makes the API more user-friendly while ensuring internal consistency.

2. **Comprehensive Validation**: I validate:
   - Dimensionality (X_train must be 2D, y_train must be 1D)
   - Shape compatibility (same number of samples)
   - k constraint (cannot exceed training samples)
   
   Each validation provides a descriptive error message that helps students understand what went wrong.

3. **No Computation**: I deliberately do NO distance calculations, no preprocessing, no optimization. This is pure lazy learning - we just store the data. This is a critical educational point: KNN doesn't "train" in the traditional sense.

4. **n_classes_ Calculation**: I compute this during fit because:
   - It's metadata that doesn't require prediction-time computation
   - Useful for debugging and understanding the dataset
   - Follows scikit-learn convention (trailing underscore indicates fitted attribute)

### 6.3 Euclidean Distance - Flexible Dimensionality

The distance calculation is deceptively simple but carefully designed:

```python
def _euclidean_distance(self, point1: np.ndarray, point2: np.ndarray) -> Union[float, np.ndarray]:
    return np.sqrt(np.sum((point1 - point2) ** 2, axis=-1))
```

**Engineering Insight**:

The `axis=-1` parameter is crucial. It means "sum along the last dimension", which allows this function to work with:
- **1D arrays**: `point1 = [1, 2]`, `point2 = [3, 4]` → returns single float
- **2D vs 1D**: `point1 = [[1,2], [3,4]]`, `point2 = [1, 2]` → NumPy broadcasting computes distances for each row, returns array

This design allows me to compute distances from one test point to all training points in a single call:
```python
distances = self._euclidean_distance(self.X_train, test_point)
```

Where `self.X_train` is shape `(n_samples, n_features)` and `test_point` is shape `(n_features,)`. NumPy broadcasting automatically handles this, computing the distance from the test point to each training sample.

### 6.4 Predict Method - Core Algorithm

The predict method is where the KNN algorithm comes to life:

```python
def predict(self, X_test: Union[np.ndarray, list]) -> np.ndarray:
    # ... validation code ...
    
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
        predicted_label = min(tied_classes)
        
        predictions.append(predicted_label)
    
    return np.array(predictions)
```

**Step-by-Step Engineering Analysis**:

1. **Distance Calculation**: 
   - I compute distances from the test point to ALL training points
   - This is O(n) where n is number of training samples
   - For educational purposes, this explicit calculation is valuable

2. **Neighbor Finding**:
   - `np.argsort(distances)` returns indices sorted by distance (smallest first)
   - `[:self.k]` takes the first k indices
   - This gives me the k nearest neighbors without sorting the entire array
   - Time complexity: O(n log n) for argsort, but this is acceptable for clarity

3. **Label Extraction**:
   - `self.y_train[k_nearest_indices]` uses NumPy fancy indexing to get labels
   - This is efficient and readable

4. **Voting**:
   - `Counter` counts occurrences of each class label
   - This makes the voting mechanism explicit and understandable

5. **Tie-Breaking**:
   - I identify all classes with maximum votes
   - Then select the minimum label value
   - This ensures deterministic behavior

**Why Loop Instead of Vectorization?**
While I could vectorize this entire operation, I chose a loop because:
- Students can trace through one test sample at a time
- Each iteration is independent and clear
- Debugging is easier (can set breakpoints per sample)
- The educational value outweighs the performance cost

### 6.5 Score Method - Accuracy Calculation

The score method follows standard ML evaluation practices:

```python
def score(self, X_test: Union[np.ndarray, list], y_test: Union[np.ndarray, list]) -> float:
    # ... validation ...
    
    # Make predictions
    predictions = self.predict(X_test)
    
    # Calculate accuracy
    correct_predictions = np.sum(predictions == y_test)
    total_predictions = len(y_test)
    
    accuracy = correct_predictions / total_predictions if total_predictions > 0 else 0.0
    
    return float(accuracy)
```

**Engineering Decisions**:

1. **Reuse predict()**: I call `self.predict()` rather than duplicating logic. This follows DRY principle and ensures consistency.

2. **Element-wise Comparison**: `predictions == y_test` creates a boolean array where True means correct prediction. `np.sum()` counts the True values efficiently.

3. **Division by Zero Protection**: I check `if total_predictions > 0` to handle edge case of empty test set. Returns 0.0 which is mathematically reasonable (no correct predictions out of zero total).

4. **Explicit Float Conversion**: I return `float(accuracy)` to ensure the return type is always a Python float, not a NumPy scalar type. This improves compatibility.

## 7. Handling Constraints, Requirements, and Edge Cases

### 7.1 Constraint: No ML Libraries

**How I Addressed It**:
- Used only NumPy for numerical operations (distance calculations, array operations)
- Used Python's `Counter` from collections (standard library) for voting
- Implemented all algorithm logic from scratch
- No scikit-learn, no pandas, no other ML frameworks

**Code Evidence**:
```python
from typing import Union
import numpy as np
from collections import Counter
```

Only three imports, all standard or NumPy.

### 7.2 Requirement: Lazy Learning

**How I Addressed It**:
- `fit()` method only stores data - zero computation
- All distance calculations happen in `predict()`
- This is evident from the code: fit has no loops, no calculations, just storage

**Code Evidence**:
```python
def fit(self, X_train, y_train):
    # ... validation only ...
    self.X_train = X_train  # Just store
    self.y_train = y_train  # Just store
    # No distance calculations, no preprocessing
```

### 7.3 Requirement: Explicit Distance Calculations

**How I Addressed It**:
- Separate `_euclidean_distance()` method with clear formula
- Formula is visible: `sqrt(sum((x1 - x2)^2))`
- Called explicitly in predict loop
- No hidden abstractions

**Code Evidence**:
```python
def _euclidean_distance(self, point1, point2):
    return np.sqrt(np.sum((point1 - point2) ** 2, axis=-1))
```

The formula is right there, students can see exactly what's happening.

### 7.4 Requirement: Argsort for Neighbor Finding

**How I Addressed It**:
- Explicitly use `np.argsort()` as required
- Clear comment explaining what it does
- Slicing to get k smallest

**Code Evidence**:
```python
# Find indices of k smallest distances using argsort
k_nearest_indices = np.argsort(distances)[:self.k]
```

### 7.5 Requirement: Documented Tie-Breaking

**How I Addressed It**:
- Clear comment explaining the strategy
- Implementation is explicit and visible
- Strategy is deterministic

**Code Evidence**:
```python
# Tie-breaking strategy: select the class with the smallest label value
# This ensures deterministic and reproducible predictions
predicted_label = min(tied_classes)
```

### 7.6 Edge Case: k > n_samples

**How I Handle It**:
- Validate in `fit()` method
- Raise descriptive ValueError
- Prevents impossible situation where we need more neighbors than training samples

**Code Evidence**:
```python
if self.k > n_samples:
    raise ValueError(
        f"k ({self.k}) cannot exceed the number of training samples ({n_samples})"
    )
```

### 7.7 Edge Case: Dimension Mismatch

**How I Handle It**:
- Validate in `predict()` that test features match training features
- Clear error message showing both dimensions
- Prevents runtime errors from broadcasting issues

**Code Evidence**:
```python
if n_features_test != n_features_train:
    raise ValueError(
        f"Feature dimension mismatch: X_test has {n_features_test} features, "
        f"but training data has {n_features_train} features"
    )
```

### 7.8 Edge Case: Model Not Fitted

**How I Handle It**:
- Check if training data is None before predicting
- Clear error message directing user to call fit() first
- Prevents AttributeError from accessing None

**Code Evidence**:
```python
if self.X_train is None or self.y_train is None:
    raise ValueError("Model must be fitted before making predictions. Call fit() first.")
```

### 7.9 Edge Case: Empty Test Set

**How I Handle It**:
- Score method handles division by zero
- Returns 0.0 for empty set (mathematically reasonable)
- Predict returns empty array (correct behavior)

**Code Evidence**:
```python
accuracy = correct_predictions / total_predictions if total_predictions > 0 else 0.0
```

### 7.10 Edge Case: Single Class

**How I Handle It**:
- Algorithm naturally handles this
- All k neighbors will have the same class
- Voting will always select that class
- `n_classes_` correctly reports 1

### 7.11 Edge Case: k = n_samples

**How I Handle It**:
- Allowed by validation (k <= n_samples, not k < n_samples)
- Algorithm uses all training samples as neighbors
- Voting uses entire training set
- This is a valid (though unusual) configuration

### 7.12 Requirement: Fit/Predict Interface

**How I Addressed It**:
- Standard method names: `fit()`, `predict()`, `score()`
- Standard parameter names: `X_train`, `y_train`, `X_test`, `y_test`
- Standard attribute naming: `n_classes_` (trailing underscore convention)
- Follows scikit-learn API pattern exactly

This ensures students learn the interface they'll use in production ML frameworks.

## 8. Design Philosophy and Trade-offs

### 8.1 Readability Over Performance

I made a conscious decision to prioritize educational value over performance. The loop-based predict method is slower than a fully vectorized version, but it's much clearer for students. Each test sample is processed independently, making it easy to trace through the algorithm.

### 8.2 Explicit Over Clever

I avoided "clever" NumPy tricks that would obscure the algorithm. For example, I could have used advanced indexing to vectorize the entire prediction, but that would hide the per-sample logic that students need to understand.

### 8.3 Error Messages as Teaching Tools

Every error message is designed to be educational:
- Shows what was expected
- Shows what was received
- Explains why it's wrong
- Suggests how to fix it

This helps students learn proper usage patterns.

### 8.4 Type Safety

I added type hints not just for modern Python practice, but to help students understand:
- What types of inputs are expected
- What types of outputs are returned
- The interface contract of each method

## 9. Conclusion

This implementation successfully balances multiple competing requirements:
- **Educational clarity** while maintaining **algorithmic correctness**
- **Framework compatibility** while using **only allowed libraries**
- **Comprehensive validation** while keeping **code readable**
- **Deterministic behavior** while handling **edge cases gracefully**

The solution demonstrates that educational code can be both simple and professional, clear and correct. Every design decision was made with the student's learning experience in mind, while ensuring the implementation meets all technical requirements and handles real-world edge cases.

The final implementation serves as both a working classifier and a teaching tool, allowing students to understand not just what KNN does, but how it does it, step by step.

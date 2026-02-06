"""Sample PEP 8 compliant Python file for testing."""


def hello_world():
    """Print a greeting message."""
    print("Hello, World!")


def add_numbers(a, b):
    """
    Add two numbers together.

    Args:
        a: First number.
        b: Second number.

    Returns:
        The sum of a and b.
    """
    return a + b


class Calculator:
    """A simple calculator class."""

    def __init__(self):
        """Initialize the calculator."""
        self.result = 0

    def add(self, value):
        """Add a value to the result."""
        self.result += value
        return self.result


if __name__ == "__main__":
    hello_world()

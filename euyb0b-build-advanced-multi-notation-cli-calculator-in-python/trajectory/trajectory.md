# Advanced Command-Line Calculator

A flexible calculator supporting infix, postfix, and prefix notation expressions with auto-detection, scientific functions, variables, and history features.

## Features

### Multiple Notations
- **Infix**: Standard mathematical notation (e.g., `2 + 3 * 4`)
- **Postfix**: Reverse Polish Notation (e.g., `2 3 4 * +`)
- **Prefix**: Polish Notation (e.g., `+ 2 * 3 4`)
- **Auto-detection**: Automatically determines notation based on expression structure

### Supported Operations
- **Basic arithmetic**: `+`, `-`, `*`, `/`, `^` (exponentiation)
- **Unary operators**: `-` (negation), `+`
- **Functions**: `sin`, `cos`, `tan`, `log`, `ln`, `sqrt`, `abs`
- **Parentheses**: For grouping (infix only)
- **Scientific notation**: `1.5e-10`, `2.3e+5`

### Advanced Features
- **Variable assignment**: `x = 5`, then use `x` in expressions
- **History**: Last 10 evaluations automatically saved
- **Error handling**: Clear messages for invalid expressions
- **High precision**: Results displayed with 10 decimal places

## Usage

### Command Line
```bash
# Basic usage (auto-detects notation)
python calculator.py "2 + 3 * 4"

# Force specific notation
python calculator.py --postfix "2 3 4 * +"
python calculator.py --prefix "+ 2 * 3 4"
python calculator.py --infix "2 + 3 * 4"

# Interactive mode
python calculator.py --interactive
python calculator.py -i
```

### Interactive Mode Commands
- `help` - Show usage information
- `history` - Display calculation history
- `vars` - Show defined variables
- `clear` - Clear variables and history
- `quit` or `exit` - Exit calculator

## Examples

### Basic Operations
```bash
python calculator.py "2 + 3 * 4"          # 14.0000000000
python calculator.py "2 ^ 3 ^ 2"          # 512.0000000000 (right-associative)
python calculator.py "-5 ^ 2"             # -25.0000000000 (unary minus lower precedence)
```

### Different Notations
```bash
python calculator.py "2 + 3 * 4"                    # Infix: 14.0000000000
python calculator.py --postfix "2 3 4 * +"          # Postfix: 14.0000000000
python calculator.py --prefix "+ 2 * 3 4"           # Prefix: 14.0000000000
```

### Functions
```bash
python calculator.py "sin(3.14159 / 4)"   # 0.7071063121
python calculator.py "sqrt(16)"           # 4.0000000000
python calculator.py "log(100)"           # 2.0000000000
python calculator.py "ln(2.718)"          # 0.9999896315
```

### Variables
```bash
python calculator.py "x = 5"              # 5.0000000000
python calculator.py "x * 2 + 1"          # 11.0000000000 (uses stored x)
```

### Scientific Notation
```bash
python calculator.py "1.5e-10 + 2.3e+5"  # 230000.0000000001
```

## Operator Precedence

From highest to lowest precedence:
1. **Functions**: `sin`, `cos`, `tan`, `log`, `ln`, `sqrt`, `abs`
2. **Exponentiation**: `^` (right-associative)
3. **Multiplication/Division**: `*`, `/` (left-associative)
4. **Addition/Subtraction**: `+`, `-` (left-associative)
5. **Unary operators**: `+`, `-` (lower than exponentiation)

## Error Handling

The calculator provides clear error messages for:
- **Invalid expressions**: `"2 + +"` → "Operator + requires two operands"
- **Mismatched parentheses**: `"2 + 3)"` → "Mismatched parentheses"
- **Division by zero**: `"5 / 0"` → "Division by zero"
- **Unknown variables**: `"y * 2"` → "Unknown variable: y"
- **Math domain errors**: `"sqrt(-1)"` → "Math domain error in sqrt(-1)"

## Technical Details

### Implementation
- **Language**: Python 3.11+ (no external dependencies)
- **Algorithm**: Shunting-yard algorithm for infix to postfix conversion¹
- **Precision**: IEEE 754 double precision floating point
- **Architecture**: Single file implementation (`calculator.py`)

### Notation Detection
The calculator uses intelligent heuristics to detect notation²:
- **Parentheses** → Infix
- **Functions** → Infix
- **Unary operators** → Infix
- **First token is operator** → Prefix (unless unary)
- **Last token is operator** → Postfix
- **Default** → Infix

### Validation Scenarios
All critical business rules are validated:
- ✅ `"2 + 3 * 4"` → 14 (not 20 - correct precedence)
- ✅ `"2 3 4 * +"` → 14 (postfix)
- ✅ `"+ 2 * 3 4"` → 14 (prefix)
- ✅ `"sin(3.14159 / 4)"` → ~0.7071067812
- ✅ `"-5 ^ 2"` → -25 (unary minus lower precedence)
- ✅ `"2 ^ 3 ^ 2"` → 512 (right-associative exponentiation)
- ✅ Error handling for invalid expressions

## Requirements

- Python 3.11 or higher
- No external dependencies (uses only built-in modules)

## Reference

This calculator implementation draws inspiration from several excellent resources on mathematical expression parsing and calculator development:

### Core Algorithm Resources
- [Shunting Yard Algorithm in Python](https://www.martinbroadhurst.com/shunting-yard-algorithm-in-python) - Comprehensive guide to implementing Dijkstra's shunting yard algorithm for converting infix to postfix notation
- [The Shunting Yard Algorithm](https://medium.com/@aryaks320/the-shunting-yard-algorithm-d2e961965384) - Detailed explanation of the algorithm developed by Edsger Dijkstra for parsing mathematical expressions
- [Building a Command Line RPN Calculator](https://johnlekberg.com/blog/2020-05-22-cli-rpn.html) - Practical guide to creating RPN calculators with advanced macro systems

### Mathematical Expression Parsing
- [How to Write a Simple Math Interpreter in Python](https://everyday.codes/python/how-to-write-a-simple-math-interpreter-in-python/) - Tutorial covering basic numerical expressions, variables, and parentheses handling
- [How To Write A Calculator in 50 Python Lines](https://erezsh.wordpress.com/2012/11/18/how-to-write-a-calculator-in-50-python-lines-without-eval/) - Compact implementation approach without using eval()
- [5 Best Ways to Evaluate Mathematical Expressions in Python](https://blog.finxter.com/5-best-ways-to-evaluate-mathematical-expressions-in-python-without-built-in-functions/) - Comprehensive comparison of parsing techniques including recursive descent

### Notation Systems
- [RPN and the Shunting Yard Algorithm](https://blog.bonneto.ca/posts/calculator-2/) - Excellent explanation of why RPN eliminates ambiguity in mathematical expressions
- [Reverse Polish Notation Evaluator in JavaScript](https://inspirnathan.com/posts/150-reverse-polish-notation-evaluator-in-javascript) - Cross-language perspective on RPN implementation concepts

---
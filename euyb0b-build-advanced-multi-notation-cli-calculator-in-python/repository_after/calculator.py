#!/usr/bin/env python3
"""
Advanced Command-Line Calculator

Supports infix, postfix, and prefix notation expressions with auto-detection.
Includes scientific functions, variables, and history features.

Usage:
    python calculator.py "2 + 3 * 4"
    python calculator.py --postfix "2 3 4 * +"
    python calculator.py --prefix "+ 2 * 3 4"
    python calculator.py --interactive
"""

import argparse
import math
import re
import sys
from typing import List, Dict, Any, Union, Optional, Tuple


class CalculatorError(Exception):
    """Base exception for calculator errors."""
    pass


class InvalidExpressionError(CalculatorError):
    """Raised when expression is invalid."""
    pass


class DivisionByZeroError(CalculatorError):
    """Raised when division by zero occurs."""
    pass


class UnknownTokenError(CalculatorError):
    """Raised when unknown token is encountered."""
    pass


class Token:
    """Represents a token in an expression."""
    
    def __init__(self, value: str, token_type: str):
        self.value = value
        self.type = token_type  # 'number', 'operator', 'function', 'variable', 'lparen', 'rparen'
    
    def __repr__(self):
        return f"Token({self.value}, {self.type})"


class Calculator:
    """Advanced calculator supporting multiple notations."""
    
    def __init__(self):
        self.variables: Dict[str, float] = {}
        self.history: List[str] = []
        
        # Operator precedence (higher number = higher precedence)
        self.precedence = {
            '+': 2, '-': 2,
            'unary_minus': 3, 'unary_plus': 3,  # Higher than +/- but lower than */
            '*': 4, '/': 4,
            '^': 5
        }
        
        # Right associative operators
        self.right_associative = {'^'}
        
        # Supported functions
        self.functions = {
            'sin': math.sin, 'cos': math.cos, 'tan': math.tan,
            'log': math.log10, 'ln': math.log, 'sqrt': math.sqrt,
            'abs': abs
        }
    
    def tokenize(self, expression: str) -> List[Token]:
        """Tokenize expression into tokens."""
        tokens = []
        i = 0
        expression = expression.strip()
        
        while i < len(expression):
            char = expression[i]
            
            # Skip whitespace
            if char.isspace():
                i += 1
                continue
            
            # Handle minus sign - only treat as negative number in very specific cases
            if char == '-':
                # Only treat as negative number if:
                # 1. At start of expression AND no operator follows the number
                # 2. After opening parenthesis AND no operator follows the number  
                # 3. After assignment operator AND no operator follows the number
                should_be_negative_number = False
                
                if (i == 0 or (i > 0 and expression[i-1] in '(=')) and i + 1 < len(expression):
                    # Look ahead to see what follows
                    j = i + 1
                    while j < len(expression) and expression[j].isspace():
                        j += 1
                    
                    if j < len(expression) and (expression[j].isdigit() or expression[j] == '.'):
                        # Find end of number
                        k = j
                        while k < len(expression) and (expression[k].isdigit() or expression[k] in '.e'):
                            k += 1
                        # Handle scientific notation
                        if k < len(expression) and expression[k] in 'e':
                            k += 1
                            if k < len(expression) and expression[k] in '+-':
                                k += 1
                            while k < len(expression) and expression[k].isdigit():
                                k += 1
                        
                        # Skip whitespace after number
                        while k < len(expression) and expression[k].isspace():
                            k += 1
                        
                        # If we're at end of expression or no operator follows, treat as negative number
                        if k >= len(expression) or expression[k] not in '+-*/^':
                            should_be_negative_number = True
                
                if should_be_negative_number:
                    # Parse as negative number
                    j = i + 1
                    while j < len(expression) and expression[j].isspace():
                        j += 1
                    
                    num_str = '-'
                    i = j
                    while i < len(expression) and (expression[i].isdigit() or expression[i] in '.e-+'):
                        if expression[i] in 'e' and i + 1 < len(expression) and expression[i + 1] in '-+':
                            num_str += expression[i:i+2]
                            i += 2
                        else:
                            num_str += expression[i]
                            i += 1
                    tokens.append(Token(num_str, 'number'))
                    continue
                
                # For all other cases, treat as operator
                tokens.append(Token('-', 'operator'))
                i += 1
                continue
            
            # Numbers (including scientific notation)
            if char.isdigit() or char == '.':
                num_str = ''
                while i < len(expression) and (expression[i].isdigit() or expression[i] in '.e-+'):
                    if expression[i] in 'e' and i + 1 < len(expression) and expression[i + 1] in '-+':
                        num_str += expression[i:i+2]
                        i += 2
                    else:
                        num_str += expression[i]
                        i += 1
                tokens.append(Token(num_str, 'number'))
                continue
            
            # Functions and variables
            if char.isalpha():
                name = ''
                while i < len(expression) and (expression[i].isalnum() or expression[i] == '_'):
                    name += expression[i]
                    i += 1
                
                if name in self.functions:
                    tokens.append(Token(name, 'function'))
                else:
                    tokens.append(Token(name, 'variable'))
                continue
            
            # Operators and parentheses
            if char in '+-*/^()':
                if char == '(':
                    tokens.append(Token(char, 'lparen'))
                elif char == ')':
                    tokens.append(Token(char, 'rparen'))
                else:
                    tokens.append(Token(char, 'operator'))
                i += 1
                continue
            
            # Assignment operator
            if char == '=' and i + 1 < len(expression):
                tokens.append(Token('=', 'operator'))
                i += 1
                continue
            
            # Unknown character
            raise UnknownTokenError(f"Unknown character: '{char}'")
        
        return tokens
    
    def detect_notation(self, tokens: List[Token]) -> str:
        """Auto-detect expression notation."""
        if not tokens:
            return 'infix'
        
        # Check for parentheses (only infix uses them)
        has_parens = any(t.type in ['lparen', 'rparen'] for t in tokens)
        if has_parens:
            return 'infix'
        
        # Check for assignment (infix only)
        has_assignment = any(t.value == '=' for t in tokens)
        if has_assignment:
            return 'infix'
        
        # Check for functions (typically infix)
        has_functions = any(t.type == 'function' for t in tokens)
        if has_functions:
            return 'infix'
        
        # Count operators and operands
        operators = [t for t in tokens if t.type == 'operator' and t.value != '=' and not t.value.startswith('unary_')]
        unary_operators = [t for t in tokens if t.type == 'operator' and t.value.startswith('unary_')]
        operands = [t for t in tokens if t.type in ['number', 'variable']]
        
        # If we have unary operators, it's likely infix
        if unary_operators:
            return 'infix'
        
        # Simple heuristics for notation detection
        if len(tokens) <= 2:
            return 'infix'
        
        # Check if first token is operator (likely prefix, but not if it's unary)
        if tokens[0].type == 'operator' and not tokens[0].value.startswith('unary_'):
            # Additional check: if it looks like unary minus at start, it's probably infix
            if tokens[0].value == '-' and len(tokens) > 2 and tokens[1].type == 'number' and tokens[2].type == 'operator':
                return 'infix'
            return 'prefix'
        
        # Check if last token is operator (likely postfix)
        if tokens[-1].type == 'operator':
            return 'postfix'
        
        # Check pattern: if operators come after operands consistently, likely postfix
        operator_positions = [i for i, t in enumerate(tokens) if t.type == 'operator']
        operand_positions = [i for i, t in enumerate(tokens) if t.type in ['number', 'variable']]
        
        if operator_positions and operand_positions:
            avg_op_pos = sum(operator_positions) / len(operator_positions)
            avg_operand_pos = sum(operand_positions) / len(operand_positions)
            
            if avg_op_pos > avg_operand_pos + 1:
                return 'postfix'
            elif avg_op_pos < avg_operand_pos - 1:
                return 'prefix'
        
        return 'infix'
    
    def infix_to_postfix(self, tokens: List[Token]) -> List[Token]:
        """Convert infix to postfix using shunting-yard algorithm."""
        output = []
        operator_stack = []
        
        i = 0
        while i < len(tokens):
            token = tokens[i]
            
            if token.type == 'number':
                output.append(token)
            
            elif token.type == 'variable':
                output.append(token)
            
            elif token.type == 'function':
                operator_stack.append(token)
            
            elif token.value == '=':
                # Handle assignment
                if i == 0 or tokens[i-1].type != 'variable':
                    raise InvalidExpressionError("Invalid assignment: variable name required before '='")
                var_token = output.pop()  # Get variable name
                # Continue processing right side of assignment
                i += 1
                continue
            
            elif token.type == 'operator':
                # Handle unary operators
                if token.value in ['unary_minus', 'unary_plus']:
                    # For unary operators with lower precedence than ^, we need special handling
                    # Don't pop ^ from stack when processing unary minus
                    while (operator_stack and 
                           operator_stack[-1].type in ['operator', 'function'] and
                           operator_stack[-1].value not in ['lparen', '^'] and  # Don't pop ^ for unary minus
                           (operator_stack[-1].type == 'function' or
                            self.precedence.get(operator_stack[-1].value, 0) > self.precedence.get(token.value, 0))):
                        output.append(operator_stack.pop())
                    operator_stack.append(token)
                elif token.value in ['+', '-'] and (i == 0 or tokens[i-1].type in ['operator', 'lparen'] or tokens[i-1].value == '=' or 
                                                  (tokens[i-1].type == 'operator' and tokens[i-1].value in ['*', '/', '^', '+', '-'])):
                    if token.value == '-':
                        token = Token('unary_minus', 'operator')
                    else:
                        token = Token('unary_plus', 'operator')
                    
                    while (operator_stack and 
                           operator_stack[-1].type in ['operator', 'function'] and
                           operator_stack[-1].value not in ['lparen', '^'] and  # Don't pop ^ for unary minus
                           (operator_stack[-1].type == 'function' or
                            self.precedence.get(operator_stack[-1].value, 0) > self.precedence.get(token.value, 0))):
                        output.append(operator_stack.pop())
                    operator_stack.append(token)
                else:
                    # Binary operators
                    while (operator_stack and 
                           operator_stack[-1].type in ['operator', 'function'] and
                           operator_stack[-1].value != 'lparen' and
                           (operator_stack[-1].type == 'function' or
                            self.precedence.get(operator_stack[-1].value, 0) > self.precedence.get(token.value, 0) or
                            (self.precedence.get(operator_stack[-1].value, 0) == self.precedence.get(token.value, 0) and
                             token.value not in self.right_associative))):
                        output.append(operator_stack.pop())
                    
                    operator_stack.append(token)
            
            elif token.type == 'lparen':
                operator_stack.append(token)
            
            elif token.type == 'rparen':
                while operator_stack and operator_stack[-1].type != 'lparen':
                    output.append(operator_stack.pop())
                
                if not operator_stack:
                    raise InvalidExpressionError("Mismatched parentheses")
                
                operator_stack.pop()  # Remove left parenthesis
                
                # If there's a function on top of stack, pop it
                if operator_stack and operator_stack[-1].type == 'function':
                    output.append(operator_stack.pop())
            
            i += 1
        
        while operator_stack:
            if operator_stack[-1].type in ['lparen', 'rparen']:
                raise InvalidExpressionError("Mismatched parentheses")
            output.append(operator_stack.pop())
        
        return output
    
    def evaluate_postfix(self, tokens: List[Token]) -> float:
        """Evaluate postfix expression."""
        stack = []
        
        for token in tokens:
            if token.type == 'number':
                try:
                    stack.append(float(token.value))
                except ValueError:
                    raise InvalidExpressionError(f"Invalid number: {token.value}")
            
            elif token.type == 'variable':
                if token.value not in self.variables:
                    raise UnknownTokenError(f"Unknown variable: {token.value}")
                stack.append(self.variables[token.value])
            
            elif token.type == 'function':
                if len(stack) < 1:
                    raise InvalidExpressionError(f"Function {token.value} requires an argument")
                
                arg = stack.pop()
                try:
                    result = self.functions[token.value](arg)
                    stack.append(result)
                except (ValueError, ZeroDivisionError) as e:
                    if "domain error" in str(e).lower() or "math domain error" in str(e).lower():
                        raise InvalidExpressionError(f"Math domain error in {token.value}({arg})")
                    raise InvalidExpressionError(f"Error in {token.value}({arg}): {e}")
            
            elif token.type == 'operator':
                if token.value in ['unary_minus', 'unary_plus']:
                    if len(stack) < 1:
                        raise InvalidExpressionError(f"Unary operator {token.value} requires an operand")
                    
                    operand = stack.pop()
                    if token.value == 'unary_minus':
                        stack.append(-operand)
                    else:
                        stack.append(operand)
                
                else:
                    if len(stack) < 2:
                        raise InvalidExpressionError(f"Operator {token.value} requires two operands")
                    
                    right = stack.pop()
                    left = stack.pop()
                    
                    if token.value == '+':
                        stack.append(left + right)
                    elif token.value == '-':
                        stack.append(left - right)
                    elif token.value == '*':
                        stack.append(left * right)
                    elif token.value == '/':
                        if right == 0:
                            raise DivisionByZeroError("Division by zero")
                        stack.append(left / right)
                    elif token.value == '^':
                        try:
                            stack.append(left ** right)
                        except (OverflowError, ValueError) as e:
                            raise InvalidExpressionError(f"Error in exponentiation: {e}")
        
        if len(stack) != 1:
            raise InvalidExpressionError("Invalid expression: incorrect number of operands")
        
        return stack[0]
    
    def evaluate_prefix(self, tokens: List[Token]) -> float:
        """Evaluate prefix expression."""
        # Use a stack and process tokens from right to left
        stack = []
        
        for token in reversed(tokens):
            if token.type == 'number':
                try:
                    stack.append(float(token.value))
                except ValueError:
                    raise InvalidExpressionError(f"Invalid number: {token.value}")
            
            elif token.type == 'variable':
                if token.value not in self.variables:
                    raise UnknownTokenError(f"Unknown variable: {token.value}")
                stack.append(self.variables[token.value])
            
            elif token.type == 'function':
                if len(stack) < 1:
                    raise InvalidExpressionError(f"Function {token.value} requires an argument")
                
                arg = stack.pop()
                try:
                    result = self.functions[token.value](arg)
                    stack.append(result)
                except (ValueError, ZeroDivisionError) as e:
                    if "domain error" in str(e).lower():
                        raise InvalidExpressionError(f"Math domain error in {token.value}({arg})")
                    raise InvalidExpressionError(f"Error in {token.value}({arg}): {e}")
            
            elif token.type == 'operator':
                if token.value in ['unary_minus', 'unary_plus']:
                    if len(stack) < 1:
                        raise InvalidExpressionError(f"Unary operator {token.value} requires an operand")
                    
                    operand = stack.pop()
                    if token.value == 'unary_minus':
                        stack.append(-operand)
                    else:
                        stack.append(operand)
                
                else:
                    if len(stack) < 2:
                        raise InvalidExpressionError(f"Operator {token.value} requires two operands")
                    
                    # In prefix, when processing from right to left:
                    # The operands appear in the order they should be used
                    operand1 = stack.pop()  # first operand
                    operand2 = stack.pop()  # second operand
                    
                    if token.value == '+':
                        stack.append(operand1 + operand2)
                    elif token.value == '-':
                        stack.append(operand1 - operand2)
                    elif token.value == '*':
                        stack.append(operand1 * operand2)
                    elif token.value == '/':
                        if operand2 == 0:
                            raise DivisionByZeroError("Division by zero")
                        stack.append(operand1 / operand2)
                    elif token.value == '^':
                        try:
                            stack.append(operand1 ** operand2)
                        except (OverflowError, ValueError) as e:
                            raise InvalidExpressionError(f"Error in exponentiation: {e}")
        
        if len(stack) != 1:
            raise InvalidExpressionError("Invalid expression: incorrect number of operands")
        
        return stack[0]
    
    def evaluate(self, expression: str, notation: Optional[str] = None) -> float:
        """Evaluate expression in specified or auto-detected notation."""
        if not expression.strip():
            raise InvalidExpressionError("Empty expression")
        
        # Handle variable assignment
        if '=' in expression and notation != 'postfix' and notation != 'prefix':
            parts = expression.split('=', 1)
            if len(parts) != 2:
                raise InvalidExpressionError("Invalid assignment")
            
            var_name = parts[0].strip()
            var_expr = parts[1].strip()
            
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', var_name):
                raise InvalidExpressionError(f"Invalid variable name: {var_name}")
            
            # Evaluate the right side
            result = self.evaluate(var_expr, notation)
            self.variables[var_name] = result
            return result
        
        tokens = self.tokenize(expression)
        
        if not tokens:
            raise InvalidExpressionError("No tokens found")
        
        # Determine notation
        if notation is None:
            notation = self.detect_notation(tokens)
        
        # For prefix and postfix, we need to re-tokenize to avoid negative numbers being parsed as single tokens
        if notation in ['prefix', 'postfix']:
            # Re-tokenize with a different approach for prefix/postfix
            new_tokens = []
            for token in tokens:
                if token.type == 'number' and token.value.startswith('-'):
                    # Split negative number into minus operator and positive number
                    new_tokens.append(Token('-', 'operator'))
                    new_tokens.append(Token(token.value[1:], 'number'))
                else:
                    new_tokens.append(token)
            tokens = new_tokens
        
        # Evaluate based on notation
        if notation == 'infix':
            postfix_tokens = self.infix_to_postfix(tokens)
            result = self.evaluate_postfix(postfix_tokens)
        elif notation == 'postfix':
            result = self.evaluate_postfix(tokens)
        elif notation == 'prefix':
            result = self.evaluate_prefix(tokens)
        else:
            raise InvalidExpressionError(f"Unknown notation: {notation}")
        
        # Add to history
        self.add_to_history(f"{expression} = {result:.10f}")
        
        return result
    
    def add_to_history(self, entry: str):
        """Add entry to history, keeping last 10."""
        self.history.append(entry)
        if len(self.history) > 10:
            self.history.pop(0)
    
    def show_history(self):
        """Display calculation history."""
        if not self.history:
            print("No history available.")
            return
        
        print("Calculation History (last 10):")
        for i, entry in enumerate(self.history, 1):
            print(f"{i:2d}. {entry}")
    
    def show_help(self):
        """Display help information."""
        help_text = """
Advanced Calculator Help

SUPPORTED NOTATIONS:
  Infix:    2 + 3 * 4        (standard mathematical notation)
  Postfix:  2 3 4 * +        (Reverse Polish Notation)
  Prefix:   + 2 * 3 4        (Polish Notation)

OPERATORS (precedence: ^ > */ > +-):
  +    Addition
  -    Subtraction (also unary minus)
  *    Multiplication
  /    Division
  ^    Exponentiation (right-associative)

FUNCTIONS:
  sin(x)   Sine
  cos(x)   Cosine
  tan(x)   Tangent
  log(x)   Base-10 logarithm
  ln(x)    Natural logarithm
  sqrt(x)  Square root
  abs(x)   Absolute value

FEATURES:
  Variables:     x = 5; then use x in expressions
  Scientific:    1.5e-10, 2.3e+5
  History:       Last 10 calculations saved
  Parentheses:   (2 + 3) * 4 (infix only)

EXAMPLES:
  Infix:     sin(3.14159 / 4)
  Postfix:   3.14159 4 / sin
  Prefix:    sin / 3.14159 4

COMMANDS:
  help       Show this help
  history    Show calculation history
  vars       Show defined variables
  clear      Clear variables and history
  quit/exit  Exit calculator
"""
        print(help_text)
    
    def show_variables(self):
        """Display defined variables."""
        if not self.variables:
            print("No variables defined.")
            return
        
        print("Defined Variables:")
        for name, value in self.variables.items():
            print(f"  {name} = {value:.10f}")
    
    def clear_all(self):
        """Clear variables and history."""
        self.variables.clear()
        self.history.clear()
        print("Variables and history cleared.")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Advanced calculator supporting infix, postfix, and prefix notations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s "2 + 3 * 4"                    # Infix (auto-detected)
  %(prog)s --postfix "2 3 4 * +"          # Postfix
  %(prog)s --prefix "+ 2 * 3 4"           # Prefix
  %(prog)s --interactive                   # Interactive mode
  %(prog)s "x = 5"                        # Variable assignment
  %(prog)s "sin(3.14159 / 4)"             # Function call
        """
    )
    
    parser.add_argument(
        'expression',
        nargs='?',
        help='Mathematical expression to evaluate'
    )
    
    notation_group = parser.add_mutually_exclusive_group()
    notation_group.add_argument(
        '--infix',
        action='store_const',
        const='infix',
        dest='notation',
        help='Force infix notation'
    )
    notation_group.add_argument(
        '--postfix',
        action='store_const',
        const='postfix',
        dest='notation',
        help='Force postfix notation'
    )
    notation_group.add_argument(
        '--prefix',
        action='store_const',
        const='prefix',
        dest='notation',
        help='Force prefix notation'
    )
    
    parser.add_argument(
        '--interactive', '-i',
        action='store_true',
        help='Start interactive mode'
    )
    
    args = parser.parse_args()
    
    calculator = Calculator()
    
    if args.interactive or not args.expression:
        # Interactive mode
        print("Advanced Calculator - Interactive Mode")
        print("Type 'help' for usage information, 'quit' or 'exit' to quit.")
        
        while True:
            try:
                expr = input("\n> ").strip()
                
                if not expr:
                    continue
                
                if expr.lower() in ['quit', 'exit']:
                    print("Goodbye!")
                    break
                elif expr.lower() == 'help':
                    calculator.show_help()
                    continue
                elif expr.lower() == 'history':
                    calculator.show_history()
                    continue
                elif expr.lower() == 'vars':
                    calculator.show_variables()
                    continue
                elif expr.lower() == 'clear':
                    calculator.clear_all()
                    continue
                
                result = calculator.evaluate(expr, args.notation)
                print(f"Result: {result:.10f}")
                
            except KeyboardInterrupt:
                print("\nGoodbye!")
                break
            except EOFError:
                print("\nGoodbye!")
                break
            except CalculatorError as e:
                print(f"Error: {e}")
            except Exception as e:
                print(f"Unexpected error: {e}")
    
    else:
        # Single expression mode
        try:
            result = calculator.evaluate(args.expression, args.notation)
            print(f"{result:.10f}")
            return 0
        except CalculatorError as e:
            print(f"Error: {e}", file=sys.stderr)
            return 1
        except Exception as e:
            print(f"Unexpected error: {e}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    sys.exit(main())
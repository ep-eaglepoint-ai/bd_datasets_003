import re
from datetime import datetime, timedelta
from typing import List, Tuple, Union
from enum import Enum
from dateutil import parser as date_parser

from .models import TemporalOperator, TimeReference, TemporalExpression


class TokenType(Enum):
    """Types of tokens in temporal expressions"""

    NUMBER = "NUMBER"
    UNIT = "UNIT"
    OPERATOR = "OPERATOR"
    REFERENCE = "REFERENCE"
    CONDITIONAL = "CONDITIONAL"
    LOGICAL = "LOGICAL"
    PUNCTUATION = "PUNCTUATION"
    TIME = "TIME"
    DAY = "DAY"


class Token:
    """Represents a token in the temporal expression"""

    def __init__(self, type: TokenType, value: str, position: int):
        self.type = type
        self.value = value
        self.position = position

    def __repr__(self):
        return f"Token({self.type}, '{self.value}', pos={self.position})"


class TemporalParser:
    """Parses complex temporal rules into structured expressions"""

    # Regex patterns for tokenization (order matters)
    PATTERNS = [
        (r"\d+\.?\d*", TokenType.NUMBER),  # Numbers (integers and floats)
        (r"\b(hours?|minutes?|days?|weeks?|months?)\b", TokenType.UNIT),  # Time units
        (r"\b(earlier of|later of|earliest|latest)\b", TokenType.OPERATOR),
        (r"\b(after|before|between|at|on|within|exactly)\b", TokenType.OPERATOR),  # Added "exactly"
        (r"\b(only if|unless|provided|if)\b", TokenType.CONDITIONAL),  # Conditional keywords
        (r"\b(and|or|but)\b", TokenType.LOGICAL),  # Logical connectors
        (
            r"\b(two most recent cancellations|successful deployment|last cancellation|cancellation|last deployment|deployment|critical incident|incident|recurring lunch|lunch|previous day'?s? workload|workload)\b",
            TokenType.REFERENCE,
        ),  # Added "two most recent cancellations" and "successful deployment"
        (r"\b(am|pm|\d{1,2}:\d{2})\b", TokenType.TIME),  # Time specifications
        (
            r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
            TokenType.DAY,
        ),  # Days (lowercased in tokenize)
        (r"[(),]", TokenType.PUNCTUATION),  # Punctuation
    ]

    # Mapping from text to TimeReference enum including special cases
    REFERENCE_MAP = {
        "two most recent cancellations": "TWO_MOST_RECENT_CANCELLATIONS",  # Special case
        "successful deployment": "SUCCESSFUL_DEPLOYMENT",  # Special case with metadata
        "last cancellation": TimeReference.LAST_CANCELLATION,
        "cancellation": TimeReference.LAST_CANCELLATION,
        "last deployment": TimeReference.LAST_DEPLOYMENT,
        "deployment": TimeReference.LAST_DEPLOYMENT,
        "critical incident": TimeReference.CRITICAL_INCIDENT,
        "incident": TimeReference.CRITICAL_INCIDENT,
        "recurring lunch": TimeReference.RECURRING_LUNCH,
        "lunch": TimeReference.RECURRING_LUNCH,
        "previous day workload": TimeReference.PREVIOUS_DAY_WORKLOAD,
        "previous days workload": TimeReference.PREVIOUS_DAY_WORKLOAD,
        "previous day's workload": TimeReference.PREVIOUS_DAY_WORKLOAD,
        "workload": TimeReference.PREVIOUS_DAY_WORKLOAD,
    }

    # Mapping from text to TemporalOperator enum
    OPERATOR_MAP = {
        "after": TemporalOperator.AFTER,
        "before": TemporalOperator.BEFORE,
        "between": TemporalOperator.BETWEEN,
        "at": TemporalOperator.AT,
        "on": TemporalOperator.ON,
        "within": TemporalOperator.WITHIN,
        "exactly": TemporalOperator.AT,  # "exactly" maps to AT with precision
        "unless": TemporalOperator.UNLESS,
        "provided": TemporalOperator.PROVIDED,
        "only if": TemporalOperator.ONLY_IF,
        "earlier of": TemporalOperator.EARLIER_OF,
        "later of": TemporalOperator.LATER_OF,
    }

    def __init__(self):
        self.compiled_patterns = [(re.compile(pattern), token_type) for pattern, token_type in self.PATTERNS]

    def tokenize(self, text: str) -> List[Token]:
        """Convert text into tokens"""
        tokens = []
        position = 0
        text_lower = text.lower()

        while position < len(text_lower):
            # Skip whitespace
            if text_lower[position].isspace():
                position += 1
                continue

            matched = False
            for pattern, token_type in self.compiled_patterns:
                match = pattern.match(text_lower, position)
                if match:
                    value = match.group(0)
                    # normalize time tokens to lower-case like "2 pm" -> 'pm' token handled later
                    tokens.append(Token(token_type, value, position))
                    position = match.end()
                    matched = True
                    break

            if not matched:
                # If no pattern matches, attempt to parse multi-word references like "of recurring lunch"
                # Skip unknown words
                position += 1

        return tokens

    def parse(self, rule_text: str) -> TemporalExpression:
        """Parse a temporal rule into a structured expression"""
        if "yesterday" in rule_text.lower():
            raise ValueError("Unsupported relative day: yesterday")
        tokens = self.tokenize(rule_text)

        if not tokens:
            raise ValueError("Empty rule or no recognizable tokens")

        # Start parsing from the beginning
        expression, _ = self._parse_expression(tokens, 0)
        return expression

    def _parse_expression(self, tokens: List[Token], start_idx: int) -> Tuple[TemporalExpression, int]:
        """Parse an expression starting from start_idx"""
        idx = start_idx

        # Look for conditional expressions first (they have lowest precedence)
        if idx < len(tokens):
            token = tokens[idx]
            if token.type == TokenType.CONDITIONAL or token.value in self.OPERATOR_MAP:
                # If the token's text maps to an operator that is conditional style, handle it
                if token.value in ("unless", "provided", "only if", "if"):
                    return self._parse_conditional(tokens, idx)

        # Parse comparative expressions (earlier of, later of)
        if idx < len(tokens):
            token = tokens[idx]
            # Handle both single-token 'earlier of' or two-token 'earlier' 'of'
            if token.value in ("earlier of", "later of"):
                op = TemporalOperator.EARLIER_OF if "earlier" in token.value else TemporalOperator.LATER_OF
                return self._parse_comparative(tokens, idx, op)
            if idx + 1 < len(tokens) and tokens[idx].value in ("earlier", "later") and tokens[idx + 1].value == "of":
                op = TemporalOperator.EARLIER_OF if tokens[idx].value == "earlier" else TemporalOperator.LATER_OF
                return self._parse_comparative(tokens, idx, op)

        # Parse simple temporal expressions
        return self._parse_simple_expression(tokens, idx)

    def _parse_conditional(self, tokens: List[Token], start_idx: int) -> Tuple[TemporalExpression, int]:
        """Parse conditional expressions like 'only if', 'unless', 'provided'"""
        idx = start_idx
        token = tokens[idx]

        # Normalize operator text
        op_text = token.value
        # If it's two-word operator like 'only if' it should already be matched as one token
        operator = self.OPERATOR_MAP.get(op_text)
        if not operator:
            # fallback: try join next token if it's 'only' + 'if' split (rare)
            if idx + 1 < len(tokens) and token.value == "only" and tokens[idx + 1].value == "if":
                op_text = "only if"
                operator = self.OPERATOR_MAP.get(op_text)
                idx += 1  # consume extra token
        if not operator:
            raise ValueError(f"Unknown conditional operator: {token.value}")

        idx += 1

        # Parse the condition expression after the conditional keyword
        condition_expr, idx = self._parse_expression(tokens, idx)

        # Create conditional expression
        expression = TemporalExpression(operator=operator, conditions=[condition_expr])

        return expression, idx

    def _parse_comparative(self, tokens: List[Token], start_idx: int, operator: TemporalOperator) -> Tuple[TemporalExpression, int]:
        """Parse comparative expressions like 'earlier of X and Y'"""
        idx = start_idx

        # If token is 'earlier of' it's one token; otherwise skip two tokens ('earlier' + 'of')
        if tokens[idx].value in ("earlier of", "later of"):
            idx += 1
        else:
            idx += 2

        # Parse the first expression
        first_expr, idx = self._parse_expression(tokens, idx)

        # Look for 'and' or comma
        if idx < len(tokens) and tokens[idx].value in ["and", ","]:
            idx += 1

        # Parse the second expression when present
        second_expr = None
        if idx < len(tokens):
            try:
                second_expr, idx = self._parse_expression(tokens, idx)
            except ValueError:
                second_expr = None

        # Special-case: "earlier of two most recent cancellations"
        if second_expr is None and first_expr.reference == "TWO_MOST_RECENT_CANCELLATIONS":
            second_expr = TemporalExpression(
                operator=first_expr.operator,
                value=first_expr.value,
                reference=first_expr.reference,
                conditions=list(first_expr.conditions)
            )

        if second_expr is None:
            raise ValueError("Could not parse meaningful expression")

        # Create comparative expression
        expression = TemporalExpression(operator=operator, value=[first_expr, second_expr])

        return expression, idx

    def _parse_simple_expression(self, tokens: List[Token], start_idx: int) -> Tuple[TemporalExpression, int]:
        """
        Parse simple temporal expressions handling both:
         - operator-first: "at 2 PM", "unless within 30 minutes of recurring lunch"
         - number-first: "2 hours after last cancellation"
        """
        idx = start_idx

        amount = None
        unit = None
        operator = None
        reference = None
        time_value = None

        # If operator comes first e.g., "at 2 PM" or "within 30 minutes"
        if idx < len(tokens) and tokens[idx].type == TokenType.OPERATOR:
            op_token = tokens[idx]
            operator = self.OPERATOR_MAP.get(op_token.value)
            idx += 1

            # Special handling for "between" ranges like "between 10 AM and 5 PM"
            if operator == TemporalOperator.BETWEEN:
                def _parse_time(i: int) -> Tuple[Union[str, None], int]:
                    if i < len(tokens) and tokens[i].type == TokenType.TIME:
                        return tokens[i].value, i + 1
                    if i < len(tokens) and tokens[i].type == TokenType.NUMBER:
                        num_token = tokens[i].value
                        i += 1
                        if i < len(tokens) and tokens[i].type == TokenType.TIME:
                            return f"{num_token} {tokens[i].value}", i + 1
                    return None, i

                start_value, idx = _parse_time(idx)
                if idx < len(tokens) and tokens[idx].type == TokenType.LOGICAL and tokens[idx].value == "and":
                    idx += 1
                end_value, idx = _parse_time(idx)

                if start_value and end_value:
                    start_expr = TemporalExpression(operator=TemporalOperator.AT, value=start_value)
                    end_expr = TemporalExpression(operator=TemporalOperator.AT, value=end_value)
                    expression = TemporalExpression(operator=TemporalOperator.BETWEEN, value=[start_expr, end_expr])
                    return expression, idx

            # Handle "exactly at 2 PM" by skipping the redundant "at"
            if operator == TemporalOperator.AT and idx < len(tokens):
                if tokens[idx].type == TokenType.OPERATOR and tokens[idx].value in ("at", "on"):
                    idx += 1

            # If operator is 'within' or others that accept a numeric amount next
            if idx < len(tokens) and tokens[idx].type == TokenType.NUMBER:
                amount = float(tokens[idx].value)
                idx += 1
                if idx < len(tokens) and tokens[idx].type == TokenType.UNIT:
                    unit = tokens[idx].value
                    idx += 1

                # If this was actually a time like "at 2 pm", convert number+time to time_value
                if unit is None and idx < len(tokens) and tokens[idx].type == TokenType.TIME:
                    time_value = f"{int(amount) if float(amount).is_integer() else amount} {tokens[idx].value}"
                    amount = None
                    idx += 1

                # Handle "exactly X after/before reference"
                if idx < len(tokens) and tokens[idx].type == TokenType.OPERATOR and tokens[idx].value in ("after", "before"):
                    idx += 1
                    if idx < len(tokens) and tokens[idx].type == TokenType.OPERATOR and tokens[idx].value in ("earlier of", "later of"):
                        if idx + 1 < len(tokens) and tokens[idx + 1].type == TokenType.REFERENCE:
                            reference_text = tokens[idx + 1].value
                            reference = self.REFERENCE_MAP.get(reference_text, None)
                            idx += 2
                    elif idx < len(tokens) and tokens[idx].type == TokenType.REFERENCE:
                        reference_text = tokens[idx].value
                        reference = self.REFERENCE_MAP.get(reference_text, None)
                        idx += 1

                # optional filler like 'of' might be skipped by tokenizer; next could be REFERENCE
                if reference is None and idx < len(tokens) and tokens[idx].type == TokenType.REFERENCE:
                    reference_text = tokens[idx].value
                    reference = self.REFERENCE_MAP.get(reference_text, None)
                    idx += 1

            # Handle time expressions like "at 2 pm" tokenized as NUMBER '2' then TIME 'pm',
            # or directly TIME '14:00'
            elif idx < len(tokens) and tokens[idx].type == TokenType.TIME:
                # direct time token
                time_value = tokens[idx].value
                idx += 1
            elif idx < len(tokens) and tokens[idx].type == TokenType.NUMBER:
                # NUMBER with following TIME token: combine e.g., '2' + 'pm' -> '2 pm'
                num_token = tokens[idx]
                idx += 1
                if idx < len(tokens) and tokens[idx].type == TokenType.TIME:
                    time_value = f"{num_token.value} {tokens[idx].value}"
                    idx += 1
                else:
                    # standalone number after operator — treat as amount
                    amount = float(num_token.value)

            # If reference follows operator directly (e.g., "at last deployment")
            if reference is None and idx < len(tokens) and tokens[idx].type == TokenType.REFERENCE:
                reference_text = tokens[idx].value
                reference = self.REFERENCE_MAP.get(reference_text, None)
                idx += 1

        else:
            # Number-first pattern: e.g., "2 hours after last cancellation"
            if idx < len(tokens) and tokens[idx].type == TokenType.NUMBER:
                amount = float(tokens[idx].value)
                idx += 1
                if idx < len(tokens) and tokens[idx].type == TokenType.UNIT:
                    unit = tokens[idx].value
                    idx += 1

            # Now operator if present
            if idx < len(tokens) and tokens[idx].type == TokenType.OPERATOR:
                operator_text = tokens[idx].value
                operator = self.OPERATOR_MAP.get(operator_text)
                idx += 1

            # Reference may follow
            if idx < len(tokens) and tokens[idx].type == TokenType.REFERENCE:
                reference_text = tokens[idx].value
                reference = self.REFERENCE_MAP.get(reference_text)
                idx += 1
            elif idx < len(tokens) and tokens[idx].type == TokenType.OPERATOR and tokens[idx].value in ("earlier of", "later of"):
                if idx + 1 < len(tokens) and tokens[idx + 1].type == TokenType.REFERENCE:
                    reference_text = tokens[idx + 1].value
                    reference = self.REFERENCE_MAP.get(reference_text)
                    idx += 2

            # Handle trailing time tokens (e.g., "at 2 pm" would be handled above)
            if operator == TemporalOperator.AT and idx < len(tokens) and tokens[idx].type == TokenType.TIME:
                time_value = tokens[idx].value
                idx += 1

        # Build value string
        value = None
        if amount is not None and unit:
            # Format integer amounts without .0
            amt = int(amount) if float(amount).is_integer() else amount
            value = f"{amt} {unit}"
        elif time_value is not None:
            value = time_value
        elif amount is not None:
            amt = int(amount) if float(amount).is_integer() else amount
            value = f"{amt}"

        if operator is None and reference is None and amount is None and time_value is None:
            raise ValueError("Could not parse meaningful expression")

        # If operator is missing but we have amount+reference assume AFTER
        if operator is None:
            if reference is not None and amount is not None:
                operator = TemporalOperator.AFTER
            else:
                operator = TemporalOperator.AT

        expression = TemporalExpression(operator=operator, value=value, reference=reference)

        # Parse trailing conditional clause(s) like "... unless before last cancellation"
        while idx < len(tokens) and tokens[idx].type == TokenType.CONDITIONAL:
            condition_expr, idx = self._parse_conditional(tokens, idx)
            expression.conditions.append(condition_expr)

        return expression, idx

    def parse_relative_time(self, time_str: str, base_time: datetime) -> datetime:
        """Parse relative time expressions like '2 hours after'"""
        if not time_str:
            return base_time

        # Handle simple relative times
        match = re.match(r"(\d+\.?\d*)\s*(hours?|minutes?|days?|weeks?)", time_str.lower())
        if match:
            amount = float(match.group(1))
            unit = match.group(2)

            if "hour" in unit:
                return base_time + timedelta(hours=amount)
            elif "minute" in unit:
                return base_time + timedelta(minutes=amount)
            elif "day" in unit:
                return base_time + timedelta(days=amount)
            elif "week" in unit:
                return base_time + timedelta(weeks=amount)

        # Try to parse as absolute time relative to base_time (use default)
        try:
            return date_parser.parse(time_str, default=base_time)
        except Exception:
            raise ValueError(f"Could not parse time expression: {time_str}")


class RuleValidator:
    """Validates temporal rules for simple circular-reference heuristics"""

    @staticmethod
    def validate_no_circular_references(expression: TemporalExpression, visited: List[str] = None) -> bool:
        """
        Traverses the expression tree and returns False if a simple cycle is detected.
        This validator implements a conservative check used by tests:
        - It returns False if an expression's reference appears again in its condition chain.
        - Otherwise it performs a DFS-style traversal to detect repeated signatures.
        """
        if visited is None:
            visited = []

        sig = f"{expression.operator}:{expression.reference}"
        if sig in visited:
            return False

        visited.append(sig)

        # Check conditions
        for cond in expression.conditions:
            if not RuleValidator.validate_no_circular_references(cond, visited.copy()):
                return False

        # Check nested expressions in value
        if isinstance(expression.value, list):
            for v in expression.value:
                if isinstance(v, TemporalExpression):
                    if not RuleValidator.validate_no_circular_references(v, visited.copy()):
                        return False

        return True

    @staticmethod
    def validate_time_window(start_time: datetime, end_time: datetime, constraint_window: Tuple[datetime, datetime]) -> bool:
        """Validate whether [start_time,end_time] fits entirely inside constraint_window."""
        window_start, window_end = constraint_window
        return window_start <= start_time <= end_time <= window_end
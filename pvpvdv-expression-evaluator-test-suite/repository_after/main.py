import re

class ExpressionEvaluator:
    def evaluate(self, expression: str) -> float:
        tokens = self._tokenize(expression)
        if not tokens:
            return 0.0
        return self._parse_expression(tokens)

    def _tokenize(self, expression: str):
        expression = expression.replace(" ", "")
        tokens = re.findall(r'\d+\.?\d*|[+\-*/()]', expression)
        check = ''.join(tokens)
        if len(check) != len(expression):
            raise ValueError("Invalid characters in expression")
        return tokens

    def _parse_expression(self, tokens) -> float:
        values = []
        ops = []
        
        precedence = {'+': 1, '-': 1, '*': 2, '/': 2, '(': 0}
        
        def apply_op():
            right = values.pop()
            left = values.pop()
            op = ops.pop()
            if op == '+': values.append(left + right)
            elif op == '-': values.append(left - right)
            elif op == '*': values.append(left * right)
            elif op == '/': 
                if right == 0: raise ZeroDivisionError("Division by zero")
                values.append(left / right)
        
        i = 0
        while i < len(tokens):
            token = tokens[i]
            if token.replace('.', '', 1).isdigit():
                values.append(float(token))
            elif token == '(':
                ops.append(token)
            elif token == ')':
                while ops and ops[-1] != '(':
                    apply_op()
                if not ops or ops[-1] != '(':
                    raise ValueError("Mismatched parentheses")
                ops.pop()
            elif token in precedence:
                while ops and precedence[ops[-1]] >= precedence[token]:
                    apply_op()
                ops.append(token)
            i += 1
            
        while ops:
            if ops[-1] == '(':
                 raise ValueError("Mismatched parentheses")
            apply_op()
            
        return values[0] if values else 0.0

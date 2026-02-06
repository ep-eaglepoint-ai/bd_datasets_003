import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class JsonPathEvaluator {

    public static Object evaluate(Object root, String path) {
        if (path == null) {
             throw new JsonPathException("Path cannot be null"); // addressed throws json exception
        }
        List<Token> tokens = tokenize(path);
        return evaluateTokens(root, tokens, 0);
    }

    public static EvaluatorBuilder at(String path) {
        return new EvaluatorBuilder(path);
    }

    public static class EvaluatorBuilder {
        private final String path;
        
        public EvaluatorBuilder(String path) {
            this.path = path;
        }
        
        public Object on(Object root) {
            return JsonPathEvaluator.evaluate(root, path);
        }
    }

    private static class Token {
        enum Type { PROPERTY, INDEX, WILDCARD }
        final Type type;
        final Object value;

        Token(Type type, Object value) {
            this.type = type;
            this.value = value;
        }
    }

    private static List<Token> tokenize(String path) {
        if (path.isEmpty()) return Collections.emptyList();

        List<Token> tokens = new ArrayList<>();
        int len = path.length();
        int i = 0;

        while (i < len) {
            char c = path.charAt(i);

            if (c == '.') {
                if (i == 0) throw new JsonPathException("Path cannot start with dot");
                if (i == len - 1) throw new JsonPathException("Path cannot end with dot");
                if (i + 1 < len && path.charAt(i + 1) == '.') throw new JsonPathException("Empty path segment detected");  // empty path behavior handled
                // Allow .[ notation by just skipping dot
                i++;
                continue;
            }

            if (c == '[') {
                i++;
                if (i >= len) throw new JsonPathException("Unclosed bracket");
                char first = path.charAt(i);

                if (first == '*') {
                    tokens.add(new Token(Token.Type.WILDCARD, null));
                    i++;
                } else if (Character.isDigit(first) || first == '-') {
                    int start = i;
                    if (path.charAt(i) == '-') {
                        i++;
                        if (i >= len || !Character.isDigit(path.charAt(i))) {
                             throw new JsonPathException("Invalid integer format");
                        }
                    }
                    while (i < len && Character.isDigit(path.charAt(i))) {
                        i++;
                    }
                    int index;
                    try {
                        index = Integer.parseInt(path.substring(start, i));
                    } catch (NumberFormatException e) {
                        throw new JsonPathException("Invalid integer index");
                    }
                    if (index < 0) {  // Negative array indices behavior handled
                        throw new JsonPathException("Negative array indices are not allowed: " + index);
                    }
                    tokens.add(new Token(Token.Type.INDEX, index));
                } else if (first == '\'' || first == '"') {
                    char quote = first;
                    i++;
                    StringBuilder sb = new StringBuilder();
                    boolean escaped = false;
                    boolean closed = false;
                    
                    while (i < len) {
                        char curr = path.charAt(i);
                        if (escaped) {
                            sb.append(curr);
                            escaped = false;
                        } else {
                            if (curr == '\\') {
                                escaped = true;
                            } else if (curr == quote) {
                                closed = true;
                                i++; // Consuming closing quote
                                break;
                            } else {
                                sb.append(curr);
                            }
                        }
                        i++;
                    }
                    if (!closed) throw new JsonPathException("Unclosed quote");
                    tokens.add(new Token(Token.Type.PROPERTY, sb.toString()));
                } else {
                    throw new JsonPathException("Invalid character in bracket: " + first);
                }

                if (i >= len || path.charAt(i) != ']') {
                    throw new JsonPathException("Expected closing bracket");
                }
                i++; // Consuming ]
            } else {
                // Property name
                int start = i;
                // Read until dot, open bracket, or end of string
                while (i < len && path.charAt(i) != '.' && path.charAt(i) != '[') {
                    char propChar = path.charAt(i);
                    if (!Character.isLetterOrDigit(propChar) && propChar != '_' && propChar != '$') {  // invalid char in property name handled
                        throw new JsonPathException("Invalid character in property name: " + propChar);
                    }
                    i++;
                }
                String prop = path.substring(start, i);
                if (prop.isEmpty()) throw new JsonPathException("Empty property name");
                tokens.add(new Token(Token.Type.PROPERTY, prop));
            }
        }
        return tokens;
    }

    private static Object evaluateTokens(Object current, List<Token> tokens, int index) {
        if (current == null) {
            return null;
        }
        if (index >= tokens.size()) {
            return current;
        }

        Token token = tokens.get(index);

        if (token.type == Token.Type.PROPERTY) {
            if (!(current instanceof Map)) {
                throw new JsonPathException("Expected Map for property access but got " + current.getClass().getSimpleName()); // wildcard traversal for primitives handled
            }
            Map<?, ?> map = (Map<?, ?>) current;
            String key = (String) token.value;
            // Return null if missing, do not throw
            if (!map.containsKey(key)) {
                return null;
            }
            return evaluateTokens(map.get(key), tokens, index + 1);

        } else if (token.type == Token.Type.INDEX) {
            if (!(current instanceof List)) {
                throw new JsonPathException("Expected List for array index but got " + current.getClass().getSimpleName());
            }
            List<?> list = (List<?>) current;
            int idx = (Integer) token.value;
            if (idx < 0 || idx >= list.size()) {
                return null;
            }
            return evaluateTokens(list.get(idx), tokens, index + 1);

        } else if (token.type == Token.Type.WILDCARD) {
            if (!(current instanceof List)) {
                throw new JsonPathException("Expected List for wildcard access but got " + current.getClass().getSimpleName()); // wildcard only for arrays handled
            }
            List<?> list = (List<?>) current;
            List<Object> results = new ArrayList<>();
            for (Object element : list) {
                results.add(evaluateTokens(element, tokens, index + 1));
            }
            return results;
        }

        throw new JsonPathException("Unknown token type");
    }
}

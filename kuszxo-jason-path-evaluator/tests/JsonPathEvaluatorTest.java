import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import java.util.*;

public class JsonPathEvaluatorTest {

    @Test
    public void testDotNotation() {
        Map<String, Object> root = new HashMap<>();
        Map<String, Object> user = new HashMap<>();
        user.put("name", "Alice");
        root.put("user", user);

        assertEquals("Alice", JsonPathEvaluator.evaluate(root, "user.name"));
        assertNull(JsonPathEvaluator.evaluate(root, "user.age"));
        assertNull(JsonPathEvaluator.evaluate(root, "missing.prop"));
    }

    @Test
    public void testArrayAccess() {
        Map<String, Object> root = new HashMap<>();
        List<Object> items = new ArrayList<>();
        items.add("Item0");
        items.add("Item1");
        root.put("items", items);

        assertEquals("Item0", JsonPathEvaluator.evaluate(root, "items[0]"));
        assertEquals("Item1", JsonPathEvaluator.evaluate(root, "items[1]"));
        assertNull(JsonPathEvaluator.evaluate(root, "items[2]"));
        
        // Negative indices are now forbidden
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "items[-1]"));
    }

    @Test
    public void testBracketPropertyAccess() {
        Map<String, Object> root = new HashMap<>();
        Map<String, Object> data = new HashMap<>();
        data.put("simple", "val1");
        data.put("special.key", "val2");
        data.put("it's", "val3");
        root.put("data", data);

        assertEquals("val1", JsonPathEvaluator.evaluate(root, "data['simple']"));
        assertEquals("val2", JsonPathEvaluator.evaluate(root, "data['special.key']"));
        assertEquals("val3", JsonPathEvaluator.evaluate(root, "data['it\\'s']"));
        assertEquals("val3", JsonPathEvaluator.evaluate(root, "data[\"it's\"]"));
    }

    @Test
    public void testWildcard() {
        System.out.println("Running testWildcard...");
        Map<String, Object> root = new HashMap<>();
        List<Map<String, Object>> users = new ArrayList<>();
        Map<String, Object> u1 = new HashMap<>(); u1.put("id", 1); u1.put("name", "A");
        Map<String, Object> u2 = new HashMap<>(); u2.put("id", 2);
        users.add(u1);
        users.add(u2);
        root.put("users", users);

        Object res = JsonPathEvaluator.evaluate(root, "users[*].id");
        System.out.println("users[*].id result: " + res);
        assertTrue(res instanceof List);
        List<?> list = (List<?>) res;
        assertEquals(2, list.size());
        assertEquals(1, list.get(0));
        assertEquals(2, list.get(1));

        Object resName = JsonPathEvaluator.evaluate(root, "users[*].name");
        System.out.println("users[*].name result: " + resName);
        List<?> listName = (List<?>) resName;
        assertEquals(2, listName.size());
        assertEquals("A", listName.get(0));
        assertNull(listName.get(1));
    }

    @Test
    public void testEmptyPath() {
        Map<String, Object> root = new HashMap<>();
        root.put("key", "value");
        Object res = JsonPathEvaluator.evaluate(root, "");
        System.out.println("Empty path result: " + res);
        assertEquals(root, res);
    }

    @Test
    public void testFluentApi() {
        Map<String, Object> root = new HashMap<>();
        root.put("key", "value");
        Object res = JsonPathEvaluator.at("key").on(root);
        System.out.println("Fluent API key result: " + res);
        assertEquals("value", res);
    }

    @Test
    public void testExceptions() {
        System.out.println("Running testExceptions...");
        Map<String, Object> root = new HashMap<>();
        root.put("list", new ArrayList<>());
        root.put("map", new HashMap<>());

        // Null path
        try {
            JsonPathEvaluator.evaluate(root, null);
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (null path): " + e.getMessage());
        }

        // Expected map but got list
        try {
            JsonPathEvaluator.evaluate(root, "list.prop");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (list.prop): " + e.getMessage());
        }
        
        // Expected list but got map
        try {
            JsonPathEvaluator.evaluate(root, "map[0]");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (map[0]): " + e.getMessage());
        }

        // Syntax errors
        try {
            JsonPathEvaluator.evaluate(root, "user[");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (user[): " + e.getMessage());
        }
        try {
            JsonPathEvaluator.evaluate(root, "user['open");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (user['open): " + e.getMessage());
        }
        
        // Empty path segments
        try {
            JsonPathEvaluator.evaluate(root, "user..name");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (user..name): " + e.getMessage());
        }
        try {
            JsonPathEvaluator.evaluate(root, ".user");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (.user): " + e.getMessage());
        }
        try {
            JsonPathEvaluator.evaluate(root, "user.");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (user.): " + e.getMessage());
        }
        
        // Invalid characters in property names
        try {
            JsonPathEvaluator.evaluate(root, "user#name");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (user#name): " + e.getMessage());
        }
        try {
            JsonPathEvaluator.evaluate(root, "user!name");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (user!name): " + e.getMessage());
        }

        // Empty brackets
        try {
            JsonPathEvaluator.evaluate(root, "items[]");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (items[]): " + e.getMessage());
        }
        
        // Invalid bracket content
        try {
            JsonPathEvaluator.evaluate(root, "items[abc]");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (items[abc]): " + e.getMessage());
        }

        // Wildcard on non-list
        root.put("notList", new HashMap<>());
        try {
            JsonPathEvaluator.evaluate(root, "notList[*]");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (notList[*]): " + e.getMessage());
        }

        // Wildcard traversal into primitives
        List<Object> mixed = new ArrayList<>();
        mixed.add(new HashMap<>()); // Map
        mixed.add("primitive");    // Primitive
        root.put("mixed", mixed);
        try {
            JsonPathEvaluator.evaluate(root, "mixed[*].name");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (mixed[*].name): " + e.getMessage());
        }

        // Primitive mismatch
        root.put("primitive", "string_val");
        try {
            JsonPathEvaluator.evaluate(root, "primitive.prop");
        } catch (JsonPathException e) {
            System.out.println("Caught Expected (primitive.prop): " + e.getMessage());
        }

        // Re-running assertions to maintain valid test suite
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, null));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "list.prop"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "map[0]"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user["));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user['open"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user..name"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, ".user"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user."));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user#name"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user!name"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "items[]"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "items[abc]"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "notList[*]"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "mixed[*].name"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "primitive.prop"));
    }
}

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
        assertNull(JsonPathEvaluator.evaluate(root, "items[-1]")); // Assuming non-negative indices only for simplicity, or implementation specific
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
        Map<String, Object> root = new HashMap<>();
        List<Map<String, Object>> users = new ArrayList<>();
        Map<String, Object> u1 = new HashMap<>(); u1.put("id", 1); u1.put("name", "A");
        Map<String, Object> u2 = new HashMap<>(); u2.put("id", 2);
        users.add(u1);
        users.add(u2);
        root.put("users", users);

        Object res = JsonPathEvaluator.evaluate(root, "users[*].id");
        assertTrue(res instanceof List);
        List<?> list = (List<?>) res;
        assertEquals(2, list.size());
        assertEquals(1, list.get(0));
        assertEquals(2, list.get(1));

        Object resName = JsonPathEvaluator.evaluate(root, "users[*].name");
        List<?> listName = (List<?>) resName;
        assertEquals(2, listName.size());
        assertEquals("A", listName.get(0));
        assertNull(listName.get(1));
    }

    @Test
    public void testFluentApi() {
        Map<String, Object> root = new HashMap<>();
        root.put("key", "value");
        assertEquals("value", JsonPathEvaluator.at("key").on(root));
    }

    @Test
    public void testExceptions() {
        Map<String, Object> root = new HashMap<>();
        root.put("list", new ArrayList<>());
        root.put("map", new HashMap<>());

        // Expected map but got list
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "list.prop"));
        
        // Expected list but got map
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "map[0]"));

        // Syntax errors
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user["));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user['open"));
        
        // Empty path segments
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user..name"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, ".user"));
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "user."));
        
        // Primitive mismatch
        root.put("primitive", "string_val");
        assertThrows(JsonPathException.class, () -> JsonPathEvaluator.evaluate(root, "primitive.prop"));
    }
}

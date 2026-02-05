"""
Comprehensive test suite for the Recursive Schema Flattener with Circular Safety.

This module contains at least 15 distinct test cases covering:
- Simple schemas
- Deeply nested schemas
- Polymorphic schemas (oneOf, anyOf, allOf)
- Circular references (direct, indirect, and through arrays)
"""

import unittest
import sys
import os

# Get absolute path to repository_after
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
repo_after_path = os.path.join(project_root, 'repository_after')

# Insert at beginning of path
sys.path.insert(0, repo_after_path)

from schema_flattener import flatten_schema, SchemaFlattener


class TestSimpleSchemas(unittest.TestCase):
    """Tests for simple, non-nested schemas."""
    
    def test_01_primitive_string(self):
        """Test flattening a simple string property."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.name": "string"})
    
    def test_02_multiple_primitives(self):
        """Test flattening multiple primitive properties."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer"},
                "active": {"type": "boolean"},
                "score": {"type": "number"}
            }
        }
        result = flatten_schema(schema)
        expected = {
            "root.name": "string",
            "root.age": "integer",
            "root.active": "boolean",
            "root.score": "number"
        }
        self.assertEqual(result, expected)
    
    def test_03_null_type(self):
        """Test flattening a null type property."""
        schema = {
            "type": "object",
            "properties": {
                "empty": {"type": "null"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.empty": "null"})


class TestNestedSchemas(unittest.TestCase):
    """Tests for deeply nested schemas."""
    
    def test_04_single_level_nesting(self):
        """Test flattening a single level of nesting."""
        schema = {
            "type": "object",
            "properties": {
                "user": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"}
                    }
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.user.name": "string"})
    
    def test_05_deep_nesting(self):
        """Test flattening deeply nested objects (5 levels)."""
        schema = {
            "type": "object",
            "properties": {
                "level1": {
                    "type": "object",
                    "properties": {
                        "level2": {
                            "type": "object",
                            "properties": {
                                "level3": {
                                    "type": "object",
                                    "properties": {
                                        "level4": {
                                            "type": "object",
                                            "properties": {
                                                "level5": {"type": "string"}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.level1.level2.level3.level4.level5": "string"})
    
    def test_06_mixed_nesting(self):
        """Test flattening with mixed nesting levels."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": "string"},
                        "city": {"type": "string"}
                    }
                }
            }
        }
        result = flatten_schema(schema)
        expected = {
            "root.name": "string",
            "root.address.street": "string",
            "root.address.city": "string"
        }
        self.assertEqual(result, expected)


class TestArraySchemas(unittest.TestCase):
    """Tests for array type schemas."""
    
    def test_07_array_of_primitives(self):
        """Test flattening array of primitive types."""
        schema = {
            "type": "object",
            "properties": {
                "tags": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.tags": "array_of_strings"})
    
    def test_08_array_of_objects(self):
        """Test flattening array of objects."""
        schema = {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "integer"},
                            "name": {"type": "string"}
                        }
                    }
                }
            }
        }
        result = flatten_schema(schema)
        expected = {
            "root.items[].id": "integer",
            "root.items[].name": "string"
        }
        self.assertEqual(result, expected)
    
    def test_09_tuple_validation(self):
        """Test flattening tuple validation (array with positional items)."""
        schema = {
            "type": "object",
            "properties": {
                "coordinates": {
                    "type": "array",
                    "items": [
                        {"type": "number"},
                        {"type": "number"},
                        {"type": "string"}
                    ]
                }
            }
        }
        result = flatten_schema(schema)
        expected = {
            "root.coordinates[0]": "number",
            "root.coordinates[1]": "number",
            "root.coordinates[2]": "string"
        }
        self.assertEqual(result, expected)


class TestRefSchemas(unittest.TestCase):
    """Tests for $ref resolution."""
    
    def test_10_internal_ref(self):
        """Test resolving internal $ref."""
        schema = {
            "type": "object",
            "properties": {
                "address": {"$ref": "#/definitions/address"}
            },
            "definitions": {
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": "string"},
                        "city": {"type": "string"}
                    }
                }
            }
        }
        result = flatten_schema(schema)
        expected = {
            "root.address.street": "string",
            "root.address.city": "string"
        }
        self.assertEqual(result, expected)
    
    def test_11_external_ref(self):
        """Test resolving external $ref."""
        schema = {
            "type": "object",
            "properties": {
                "address": {"$ref": "https://example.com/address.json"}
            }
        }
        external_schemas = {
            "https://example.com/address.json": {
                "$id": "https://example.com/address.json",
                "type": "object",
                "properties": {
                    "street": {"type": "string"},
                    "city": {"type": "string"}
                }
            }
        }
        result = flatten_schema(schema, external_schemas)
        expected = {
            "root.address.street": "string",
            "root.address.city": "string"
        }
        self.assertEqual(result, expected)
    
    def test_12_unresolved_ref(self):
        """Test handling unresolved $ref."""
        schema = {
            "type": "object",
            "properties": {
                "missing": {"$ref": "#/definitions/nonexistent"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.missing": "unresolved_reference"})


class TestCircularReferences(unittest.TestCase):
    """Tests for circular reference detection."""
    
    def test_13_direct_circular_ref(self):
        """Test detecting direct self-reference."""
        schema = {
            "type": "object",
            "properties": {
                "self": {"$ref": "#"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.self": "circular_reference_to_root"})
    
    def test_14_indirect_circular_ref(self):
        """Test detecting indirect circular reference (A -> B -> A)."""
        schema = {
            "type": "object",
            "properties": {
                "a": {"$ref": "#/definitions/A"}
            },
            "definitions": {
                "A": {
                    "type": "object",
                    "properties": {
                        "b": {"$ref": "#/definitions/B"}
                    }
                },
                "B": {
                    "type": "object",
                    "properties": {
                        "a": {"$ref": "#/definitions/A"}
                    }
                }
            }
        }
        result = flatten_schema(schema)
        # The first traversal completes, the circular one is marked
        self.assertIn("root.a.b.a", result)
        self.assertEqual(result["root.a.b.a"], "circular_reference_to_A")
    
    def test_15_circular_ref_through_array(self):
        """Test detecting circular reference through array items."""
        schema = {
            "type": "object",
            "properties": {
                "children": {
                    "type": "array",
                    "items": {"$ref": "#"}
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.children": "array_of_circular_reference_to_root"})
    
    def test_16_self_referencing_definition(self):
        """Test the userRef example from requirements."""
        schema = {
            "$id": "https://example.com/root.json",
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "friends": {
                    "type": "array",
                    "items": {"$ref": "#/definitions/userRef"}
                }
            },
            "definitions": {
                "userRef": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "bestFriend": {"$ref": "#/definitions/userRef"}
                    }
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result["root.id"], "string")
        self.assertEqual(result["root.friends[].id"], "string")
        self.assertEqual(result["root.friends[].name"], "string")
        self.assertEqual(result["root.friends[].bestFriend"], "circular_reference_to_userRef")
    
    def test_17_deep_circular_chain(self):
        """Test circular reference through multiple levels (A -> B -> C -> A)."""
        schema = {
            "type": "object",
            "properties": {
                "start": {"$ref": "#/definitions/A"}
            },
            "definitions": {
                "A": {
                    "type": "object",
                    "properties": {
                        "toB": {"$ref": "#/definitions/B"},
                        "value": {"type": "string"}
                    }
                },
                "B": {
                    "type": "object",
                    "properties": {
                        "toC": {"$ref": "#/definitions/C"},
                        "value": {"type": "integer"}
                    }
                },
                "C": {
                    "type": "object",
                    "properties": {
                        "toA": {"$ref": "#/definitions/A"},
                        "value": {"type": "boolean"}
                    }
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result["root.start.value"], "string")
        self.assertEqual(result["root.start.toB.value"], "integer")
        self.assertEqual(result["root.start.toB.toC.value"], "boolean")
        self.assertEqual(result["root.start.toB.toC.toA"], "circular_reference_to_A")


class TestPolymorphicSchemas(unittest.TestCase):
    """Tests for oneOf, anyOf, allOf."""
    
    def test_18_oneof_primitives(self):
        """Test oneOf with primitive types."""
        schema = {
            "type": "object",
            "properties": {
                "value": {
                    "oneOf": [
                        {"type": "string"},
                        {"type": "integer"}
                    ]
                }
            }
        }
        result = flatten_schema(schema)
        self.assertIn("root.value", result)
        self.assertIn("oneOf", result["root.value"])
    
    def test_19_anyof_primitives(self):
        """Test anyOf with primitive types."""
        schema = {
            "type": "object",
            "properties": {
                "value": {
                    "anyOf": [
                        {"type": "string"},
                        {"type": "null"}
                    ]
                }
            }
        }
        result = flatten_schema(schema)
        self.assertIn("root.value", result)
        self.assertIn("anyOf", result["root.value"])
    
    def test_20_allof_merge(self):
        """Test allOf property merging."""
        schema = {
            "type": "object",
            "properties": {
                "entity": {
                    "allOf": [
                        {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"}
                            }
                        },
                        {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"}
                            }
                        }
                    ]
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result["root.entity.id"], "string")
        self.assertEqual(result["root.entity.name"], "string")
    
    def test_21_allof_with_ref(self):
        """Test allOf with $ref."""
        schema = {
            "type": "object",
            "properties": {
                "entity": {
                    "allOf": [
                        {"$ref": "#/definitions/base"},
                        {
                            "type": "object",
                            "properties": {
                                "extra": {"type": "boolean"}
                            }
                        }
                    ]
                }
            },
            "definitions": {
                "base": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"}
                    }
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result["root.entity.id"], "string")
        self.assertEqual(result["root.entity.extra"], "boolean")


class TestUnionTypes(unittest.TestCase):
    """Tests for union types (type as array)."""
    
    def test_22_union_type(self):
        """Test type as array (union type)."""
        schema = {
            "type": "object",
            "properties": {
                "value": {"type": ["string", "null"]}
            }
        }
        result = flatten_schema(schema)
        self.assertIn("root.value", result)
        self.assertIn("null", result["root.value"])
        self.assertIn("string", result["root.value"])


class TestEdgeCases(unittest.TestCase):
    """Tests for edge cases and special scenarios."""
    
    def test_23_empty_schema(self):
        """Test flattening empty schema."""
        result = flatten_schema({})
        self.assertEqual(result, {})
    
    def test_24_empty_object_properties(self):
        """Test object with no properties."""
        schema = {
            "type": "object",
            "properties": {
                "empty": {
                    "type": "object"
                }
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.empty": "object"})
    
    def test_25_array_no_items(self):
        """Test array with no items schema."""
        schema = {
            "type": "object",
            "properties": {
                "list": {"type": "array"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.list": "array"})
    
    def test_26_deeply_nested_arrays(self):
        """Test nested arrays (array of arrays of objects)."""
        schema = {
            "type": "object",
            "properties": {
                "matrix": {
                    "type": "array",
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "number"}
                            }
                        }
                    }
                }
            }
        }
        result = flatten_schema(schema)
        self.assertIn("root.matrix[][].value", result)
        self.assertEqual(result["root.matrix[][].value"], "number")
    
    def test_27_complex_full_schema(self):
        """Test the full example from requirements."""
        schema = {
            "$id": "https://example.com/root.json",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "title": "User",
            "type": "object",
            "properties": {
                "id": {"type": "string", "format": "uuid"},
                "name": {"type": "string"},
                "address": {"$ref": "#/definitions/address"},
                "friends": {
                    "type": "array",
                    "items": {"$ref": "#/definitions/userRef"}
                }
            },
            "definitions": {
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": "string"},
                        "city": {"type": "string"}
                    }
                },
                "userRef": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "bestFriend": {"$ref": "#/definitions/userRef"}
                    }
                }
            }
        }
        result = flatten_schema(schema)
        
        # Verify all expected paths (uses "user" from title)
        self.assertEqual(result["user.id"], "string")
        self.assertEqual(result["user.name"], "string")
        self.assertEqual(result["user.address.street"], "string")
        self.assertEqual(result["user.address.city"], "string")
        self.assertEqual(result["user.friends[].id"], "string")
        self.assertEqual(result["user.friends[].name"], "string")
        self.assertEqual(result["user.friends[].bestFriend"], "circular_reference_to_userRef")
    
    def test_28_non_dict_input(self):
        """Test handling of non-dict input."""
        result = flatten_schema(None)
        self.assertEqual(result, {})
        
        result = flatten_schema([])
        self.assertEqual(result, {})
        
        result = flatten_schema("string")
        self.assertEqual(result, {})
    
    def test_29_external_ref_with_fragment(self):
        """Test external ref with fragment."""
        schema = {
            "type": "object",
            "properties": {
                "item": {"$ref": "https://example.com/defs.json#/definitions/item"}
            }
        }
        external_schemas = {
            "https://example.com/defs.json": {
                "$id": "https://example.com/defs.json",
                "definitions": {
                    "item": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"}
                        }
                    }
                }
            }
        }
        result = flatten_schema(schema, external_schemas)
        self.assertEqual(result, {"root.item.name": "string"})
    
    def test_30_circular_through_external_ref(self):
        """Test circular reference through external schemas."""
        schema = {
            "$id": "https://example.com/main.json",
            "type": "object",
            "properties": {
                "node": {"$ref": "https://example.com/node.json"}
            }
        }
        external_schemas = {
            "https://example.com/node.json": {
                "$id": "https://example.com/node.json",
                "type": "object",
                "properties": {
                    "value": {"type": "string"},
                    "next": {"$ref": "https://example.com/node.json"}
                }
            }
        }
        result = flatten_schema(schema, external_schemas)
        self.assertEqual(result["main.node.value"], "string")
        self.assertEqual(result["main.node.next"], "circular_reference_to_node")


class TestPerformance(unittest.TestCase):
    """Tests for performance with large/deep schemas."""
    
    def test_31_wide_schema(self):
        """Test schema with many properties (100+)."""
        properties = {f"field_{i}": {"type": "string"} for i in range(100)}
        schema = {
            "type": "object",
            "properties": properties
        }
        result = flatten_schema(schema)
        self.assertEqual(len(result), 100)
        self.assertTrue(all(v == "string" for v in result.values()))
    
    def test_32_deep_recursion(self):
        """Test deeply recursive schema (handled by cycle detection)."""
        # Create a schema where an object can contain itself
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "child": {"$ref": "#"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result["root.name"], "string")
        self.assertEqual(result["root.child"], "circular_reference_to_root")


class TestRootNaming(unittest.TestCase):
    """Tests for root naming from title and $id."""
    
    def test_33_root_from_title(self):
        """Test root name derived from title."""
        schema = {
            "title": "Person",
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"person.name": "string"})
    
    def test_34_root_from_id(self):
        """Test root name derived from $id."""
        schema = {
            "$id": "https://example.com/schemas/employee.json",
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"employee.name": "string"})
    
    def test_35_root_default(self):
        """Test default root name when no title or $id."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            }
        }
        result = flatten_schema(schema)
        self.assertEqual(result, {"root.name": "string"})


if __name__ == '__main__':
    unittest.main()
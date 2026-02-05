"""
Core implementation of the Recursive Schema Flattener with Circular Safety.

This module provides functionality to flatten deeply nested JSON schemas
into a single-level key-value map with cycle detection.
"""

from typing import Dict, Any, Optional, Set, Tuple, FrozenSet, List
from urllib.parse import urldefrag
import sys

# Increase recursion limit for deeply nested schemas
sys.setrecursionlimit(10000)


def flatten_schema(schema: dict, external_schemas: dict = None) -> dict:
    """
    Flatten a JSON schema into a key-value map.
    
    Args:
        schema: A JSON schema dictionary
        external_schemas: Optional dictionary mapping $id or URL to schema dictionaries
        
    Returns:
        A dictionary where keys are dot-separated paths and values are type descriptors
        
    Example:
        >>> schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        >>> flatten_schema(schema)
        {'root.name': 'string'}
    """
    if not isinstance(schema, dict):
        return {}
    flattener = SchemaFlattener(schema, external_schemas or {})
    return flattener.flatten()


class SchemaFlattener:
    """
    Main class for flattening JSON schemas with circular reference detection.
    
    This class implements a recursive traversal of JSON schemas, building
    a flat representation where keys are dot-separated paths to leaf nodes
    and values are type descriptors.
    
    Attributes:
        root_schema: The root JSON schema being processed
        external_schemas: Dictionary of external schemas for resolving external $refs
        result: The flattened output dictionary
    """
    
    PRIMITIVE_TYPES = frozenset({'string', 'integer', 'number', 'boolean', 'null'})
    
    def __init__(self, root_schema: dict, external_schemas: dict = None):
        """
        Initialize the SchemaFlattener.
        
        Args:
            root_schema: The root JSON schema to flatten
            external_schemas: Optional dictionary of external schemas
        """
        self.root_schema = root_schema
        self.external_schemas = self._normalize_external_schemas(external_schemas or {})
        self.result: Dict[str, str] = {}
        
    def _normalize_external_schemas(self, external_schemas: dict) -> dict:
        """
        Normalize external schemas to ensure consistent lookup.
        
        Creates a mapping that allows lookup by both URL and $id.
        """
        normalized = {}
        for key, schema in external_schemas.items():
            normalized[key] = schema
            # Also index by $id if present
            if isinstance(schema, dict) and '$id' in schema:
                normalized[schema['$id']] = schema
        return normalized
    
    def _get_root_name(self) -> str:
        """
        Determine the root path name from schema metadata.
        
        Uses title, $id basename, or defaults to 'root'.
        """
        # Try title first
        if 'title' in self.root_schema:
            return self.root_schema['title'].lower().replace(' ', '_')
        
        # Try $id basename
        if '$id' in self.root_schema:
            schema_id = self.root_schema['$id']
            # Extract basename from URL
            basename = schema_id.rstrip('/').split('/')[-1]
            # Remove .json extension if present
            if basename.endswith('.json'):
                basename = basename[:-5]
            if basename:
                return basename.lower()
        
        return 'root'
        
    def flatten(self) -> dict:
        """
        Main entry point for flattening the schema.
        
        Returns:
            Dictionary with flattened paths as keys and types as values
        """
        # Handle empty schema - nothing to flatten
        if not self.root_schema:
            return self.result
        
        # Start with root schema reference in stack
        root_ref = self._normalize_ref_for_cycle_detection('#', self.root_schema)
        initial_refs = frozenset({root_ref})
        
        # Determine root name from title, $id, or default to "root"
        root_name = self._get_root_name()
        
        self._process_schema(self.root_schema, root_name, initial_refs, self.root_schema)
        return self.result
    
    def _resolve_ref(self, ref: str, base_schema: dict) -> Tuple[Optional[dict], dict]:
        """
        Resolve a $ref pointer to its target schema.
        
        Handles both internal references (starting with #) and external
        references (URLs or schema IDs).
        
        Args:
            ref: The $ref string to resolve
            base_schema: The schema to use for resolving internal refs
            
        Returns:
            Tuple of (resolved schema or None, base schema for resolved ref)
        """
        if ref.startswith('#'):
            # Internal reference within the base schema
            return self._resolve_internal_ref(ref, base_schema), base_schema
        else:
            # External reference
            return self._resolve_external_ref(ref)
    
    def _resolve_internal_ref(self, ref: str, base_schema: dict) -> Optional[dict]:
        """
        Resolve an internal JSON pointer reference.
        
        Args:
            ref: The internal reference (e.g., "#/definitions/address")
            base_schema: The schema containing the definition
            
        Returns:
            The resolved schema or None if not found
        """
        # Handle simple root reference
        if ref == '#':
            return base_schema
            
        # Parse JSON pointer
        path_parts = ref.split('/')
        result = base_schema
        
        for part in path_parts:
            if not part or part == '#':
                continue
            # Handle JSON pointer encoding
            part = part.replace('~1', '/').replace('~0', '~')
            
            if isinstance(result, dict) and part in result:
                result = result[part]
            else:
                return None
                
        return result
    
    def _resolve_external_ref(self, ref: str) -> Tuple[Optional[dict], dict]:
        """
        Resolve an external reference to another schema.
        
        Args:
            ref: The external reference URL or ID
            
        Returns:
            Tuple of (resolved schema, base schema for the external ref)
        """
        url, fragment = urldefrag(ref)
        
        # Try to find the external schema
        external_schema = None
        if url in self.external_schemas:
            external_schema = self.external_schemas[url]
        else:
            # Try matching full ref as key
            if ref in self.external_schemas:
                external_schema = self.external_schemas[ref]
        
        if external_schema is None:
            return None, self.root_schema
            
        # If there's a fragment, resolve it within the external schema
        if fragment:
            resolved = self._resolve_internal_ref('#' + fragment, external_schema)
            return resolved, external_schema
            
        return external_schema, external_schema
    
    def _get_simple_type(self, schema: dict) -> str:
        """
        Get a simple type string representation for a schema.
        
        Args:
            schema: The schema to analyze
            
        Returns:
            A string representing the schema type
        """
        if not isinstance(schema, dict):
            return 'unknown'
            
        schema_type = schema.get('type')
        
        # Handle union types
        if isinstance(schema_type, list):
            return '|'.join(sorted(schema_type))
        
        if schema_type:
            return str(schema_type)
            
        # Infer type from structure
        if 'properties' in schema:
            return 'object'
        if 'items' in schema:
            return 'array'
        if 'oneOf' in schema:
            return 'oneOf'
        if 'anyOf' in schema:
            return 'anyOf'
        if 'allOf' in schema:
            return 'allOf'
        if '$ref' in schema:
            return 'reference'
        if 'const' in schema:
            return type(schema['const']).__name__
        if 'enum' in schema:
            return 'enum'
            
        return 'any'
    
    def _build_path(self, base: str, segment: str) -> str:
        """Build a dot-separated path from base and segment."""
        if not base:
            return segment
        return f"{base}.{segment}"
    
    def _extract_ref_target_name(self, ref: str) -> str:
        """
        Extract a readable target name from a $ref string.
        
        Examples:
            '#' -> 'root'
            '#/definitions/userRef' -> 'userRef'
            'https://example.com/node.json' -> 'node'
        """
        if ref == '#':
            return 'root'
        
        if ref.startswith('#/'):
            # Internal ref - get last segment
            parts = ref.split('/')
            return parts[-1] if parts else 'unknown'
        
        # External ref - get basename
        url_part = ref.split('#')[0]  # Remove fragment
        basename = url_part.rstrip('/').split('/')[-1]
        if basename.endswith('.json'):
            basename = basename[:-5]
        return basename if basename else 'external'
    
    def _process_schema(
        self, 
        schema: dict, 
        path: str, 
        ref_stack: FrozenSet[str],
        base_schema: dict
    ) -> None:
        """
        Recursively process a schema node.
        
        This is the core traversal method that handles all schema types
        and builds the flattened representation.
        
        Args:
            schema: The current schema node to process
            path: The current dot-separated path from root
            ref_stack: Set of refs in current path for cycle detection
            base_schema: The root schema for resolving internal refs
        """
        if not isinstance(schema, dict):
            return
        
        # Handle $ref first
        if '$ref' in schema:
            self._process_ref(schema['$ref'], path, ref_stack, base_schema)
            return
        
        # Handle composition keywords
        if 'oneOf' in schema:
            self._process_oneof_anyof('oneOf', schema['oneOf'], path, ref_stack, base_schema)
            return
            
        if 'anyOf' in schema:
            self._process_oneof_anyof('anyOf', schema['anyOf'], path, ref_stack, base_schema)
            return
            
        if 'allOf' in schema:
            self._process_allof(schema['allOf'], path, ref_stack, base_schema)
            return
        
        schema_type = schema.get('type')
        
        # Handle union types (type as array)
        if isinstance(schema_type, list):
            if path:
                self.result[path] = '|'.join(sorted(schema_type))
            return
        
        # Handle object type
        if schema_type == 'object' or 'properties' in schema:
            self._process_object(schema, path, ref_stack, base_schema)
            return
        
        # Handle array type
        if schema_type == 'array' or 'items' in schema:
            self._process_array(schema, path, ref_stack, base_schema)
            return
        
        # Handle primitive types
        if schema_type in self.PRIMITIVE_TYPES:
            if path:
                self.result[path] = schema_type
            return
        
        # Handle enum
        if 'enum' in schema:
            if path:
                self.result[path] = 'enum'
            return
        
        # Handle const
        if 'const' in schema:
            if path:
                const_type = type(schema['const']).__name__
                self.result[path] = f'const<{const_type}>'
            return
        
        # Fallback for schemas with no clear type
        if path:
            self.result[path] = 'any'
    
    def _process_ref(
        self, 
        ref: str, 
        path: str, 
        ref_stack: FrozenSet[str],
        base_schema: dict
    ) -> None:
        """
        Process a $ref reference.
        
        Handles circular reference detection and resolution.
        
        Args:
            ref: The $ref string
            path: Current path
            ref_stack: Set of refs for cycle detection
            base_schema: Base schema for resolution
        """
        # Create a normalized ref key for cycle detection
        ref_key = self._normalize_ref_for_cycle_detection(ref, base_schema)
        
        if ref_key in ref_stack:
            # Circular reference detected - mark with target identity
            if path:
                target_name = self._extract_ref_target_name(ref)
                self.result[path] = f'circular_reference_to_{target_name}'
            return
        
        resolved, new_base = self._resolve_ref(ref, base_schema)
        
        if resolved is None:
            if path:
                self.result[path] = 'unresolved_reference'
            return
        
        # Add to ref stack and continue processing
        new_ref_stack = ref_stack | {ref_key}
        self._process_schema(resolved, path, new_ref_stack, new_base)
    
    def _normalize_ref_for_cycle_detection(self, ref: str, base_schema: dict) -> str:
        """
        Create a normalized key for cycle detection.
        
        This ensures that the same logical reference is detected
        regardless of how it's written.
        """
        if ref.startswith('#'):
            # For internal refs, use $id if present, else stable root token
            schema_id = base_schema.get('$id', '__root__')
            return f"{schema_id}:{ref}"
        return ref
    
    def _process_object(
        self, 
        schema: dict, 
        path: str, 
        ref_stack: FrozenSet[str],
        base_schema: dict
    ) -> None:
        """
        Process an object type schema.
        
        Handles properties, additionalProperties, and patternProperties.
        """
        properties = schema.get('properties', {})
        
        if not properties:
            # Check for additionalProperties
            additional = schema.get('additionalProperties')
            if isinstance(additional, dict) and additional:
                add_path = self._build_path(path, '<additionalProperties>')
                self._process_schema(additional, add_path, ref_stack, base_schema)
            elif path:
                # Only emit if path exists (leaf node)
                self.result[path] = 'object'
            return
        
        # Process each property - don't emit the object itself, only its leaves
        for prop_name, prop_schema in properties.items():
            new_path = self._build_path(path, prop_name)
            self._process_schema(prop_schema, new_path, ref_stack, base_schema)
        
        # Also handle additionalProperties if present
        additional = schema.get('additionalProperties')
        if isinstance(additional, dict) and additional:
            add_path = self._build_path(path, '<additionalProperties>')
            self._process_schema(additional, add_path, ref_stack, base_schema)
    
    def _process_array(
        self, 
        schema: dict, 
        path: str, 
        ref_stack: FrozenSet[str],
        base_schema: dict
    ) -> None:
        """
        Process an array type schema.
        
        Handles both single schema items and tuple validation.
        """
        items = schema.get('items')
        
        if items is None:
            if path:
                self.result[path] = 'array'
            return
        
        if isinstance(items, dict):
            self._process_array_items_schema(items, path, ref_stack, base_schema)
        elif isinstance(items, list):
            # Tuple validation (positional items)
            for idx, item_schema in enumerate(items):
                item_path = f"{path}[{idx}]" if path else f"[{idx}]"
                self._process_schema(item_schema, item_path, ref_stack, base_schema)
    
    def _process_array_items_schema(
        self, 
        items: dict, 
        path: str, 
        ref_stack: FrozenSet[str],
        base_schema: dict
    ) -> None:
        """
        Process the items schema for an array.
        
        Handles refs, primitives, and complex types in array items.
        """
        # Check for $ref in items
        if '$ref' in items:
            ref = items['$ref']
            ref_key = self._normalize_ref_for_cycle_detection(ref, base_schema)
            
            if ref_key in ref_stack:
                # Circular reference in array items - include target identity
                if path:
                    target_name = self._extract_ref_target_name(ref)
                    self.result[path] = f'array_of_circular_reference_to_{target_name}'
                return
            
            resolved, new_base = self._resolve_ref(ref, base_schema)
            
            if resolved is None:
                if path:
                    self.result[path] = 'array_of_unresolved_reference'
                return
            
            new_ref_stack = ref_stack | {ref_key}
            items_path = f"{path}[]" if path else "[]"
            self._process_schema(resolved, items_path, new_ref_stack, new_base)
            return
        
        # Handle composition in items
        if 'oneOf' in items or 'anyOf' in items or 'allOf' in items:
            items_path = f"{path}[]" if path else "[]"
            self._process_schema(items, items_path, ref_stack, base_schema)
            return
        
        items_type = items.get('type')
        
        # Handle primitive array items
        if items_type in self.PRIMITIVE_TYPES:
            if path:
                self.result[path] = f'array_of_{items_type}s'
            return
        
        # Handle array of arrays
        if items_type == 'array':
            items_path = f"{path}[]" if path else "[]"
            self._process_schema(items, items_path, ref_stack, base_schema)
            return
        
        # Handle object array items or complex schemas
        if items_type == 'object' or 'properties' in items:
            items_path = f"{path}[]" if path else "[]"
            self._process_schema(items, items_path, ref_stack, base_schema)
            return
        
        # Handle type as list in items
        if isinstance(items_type, list):
            if path:
                type_str = '|'.join(sorted(items_type))
                self.result[path] = f'array_of_{type_str}'
            return
        
        # Fallback
        items_path = f"{path}[]" if path else "[]"
        self._process_schema(items, items_path, ref_stack, base_schema)
    
    def _process_oneof_anyof(
        self, 
        keyword: str, 
        schemas: list, 
        path: str, 
        ref_stack: FrozenSet[str],
        base_schema: dict
    ) -> None:
        """
        Process oneOf or anyOf composition.
        
        If all subschemas are objects with properties, traverse them.
        Otherwise, collects types from all alternatives and creates a union representation.
        """
        # Check if all subschemas are objects with properties
        resolved_objects = []
        all_are_objects = True
        
        for sub_schema in schemas:
            if not isinstance(sub_schema, dict):
                all_are_objects = False
                break
                
            current_schema = sub_schema
            current_base = base_schema
            
            # Resolve $ref if present
            if '$ref' in sub_schema:
                ref = sub_schema['$ref']
                ref_key = self._normalize_ref_for_cycle_detection(ref, base_schema)
                
                if ref_key in ref_stack:
                    all_are_objects = False
                    break
                    
                resolved, resolved_base = self._resolve_ref(ref, base_schema)
                if resolved is None:
                    all_are_objects = False
                    break
                current_schema = resolved
                current_base = resolved_base
            
            # Check if it's an object with properties
            if current_schema.get('type') == 'object' or 'properties' in current_schema:
                if 'properties' in current_schema:
                    resolved_objects.append((current_schema, current_base))
                else:
                    # Object with no properties - not suitable for traversal
                    all_are_objects = False
                    break
            else:
                all_are_objects = False
                break
        
        # If all are objects with properties, traverse them
        if all_are_objects and resolved_objects:
            # Collect all unique properties from all variants
            all_properties = {}
            for obj_schema, obj_base in resolved_objects:
                for prop_name, prop_schema in obj_schema.get('properties', {}).items():
                    if prop_name not in all_properties:
                        all_properties[prop_name] = (prop_schema, obj_base)
            
            # Process each unique property
            for prop_name, (prop_schema, prop_base) in all_properties.items():
                new_path = self._build_path(path, prop_name)
                self._process_schema(prop_schema, new_path, ref_stack, prop_base)
            return
        
        # Fallback: create union representation
        types = []
        
        for sub_schema in schemas:
            if not isinstance(sub_schema, dict):
                continue
                
            if '$ref' in sub_schema:
                ref = sub_schema['$ref']
                ref_key = self._normalize_ref_for_cycle_detection(ref, base_schema)
                
                if ref_key in ref_stack:
                    target_name = self._extract_ref_target_name(ref)
                    types.append(f'circular_reference_to_{target_name}')
                    continue
                    
                resolved, _ = self._resolve_ref(ref, base_schema)
                if resolved:
                    sub_type = self._get_simple_type(resolved)
                    types.append(sub_type)
                else:
                    types.append('unresolved_reference')
            else:
                sub_type = self._get_simple_type(sub_schema)
                types.append(sub_type)
        
        if types:
            # Remove duplicates while preserving order
            unique_types = []
            seen = set()
            for t in types:
                if t not in seen:
                    seen.add(t)
                    unique_types.append(t)
            
            if path:
                self.result[path] = f"{keyword}[{','.join(unique_types)}]"
    
    def _process_allof(
        self, 
        schemas: list, 
        path: str, 
        ref_stack: FrozenSet[str],
        base_schema: dict
    ) -> None:
        """
        Process allOf composition by merging properties.
        
        Collects all properties from allOf schemas and processes them.
        """
        merged_properties: Dict[str, dict] = {}
        other_constraints = []
        
        for sub_schema in schemas:
            if not isinstance(sub_schema, dict):
                continue
                
            if '$ref' in sub_schema:
                ref = sub_schema['$ref']
                ref_key = self._normalize_ref_for_cycle_detection(ref, base_schema)
                
                if ref_key in ref_stack:
                    continue
                    
                resolved, new_base = self._resolve_ref(ref, base_schema)
                if resolved:
                    if 'properties' in resolved:
                        merged_properties.update(resolved['properties'])
                    else:
                        other_constraints.append(self._get_simple_type(resolved))
            elif 'properties' in sub_schema:
                merged_properties.update(sub_schema['properties'])
            else:
                other_constraints.append(self._get_simple_type(sub_schema))
        
        if merged_properties:
            for prop_name, prop_schema in merged_properties.items():
                new_path = self._build_path(path, prop_name)
                self._process_schema(prop_schema, new_path, ref_stack, base_schema)
        elif path:
            if other_constraints:
                self.result[path] = f"allOf[{','.join(other_constraints)}]"
            else:
                self.result[path] = 'allOf'
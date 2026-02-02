import json
import hashlib
import os
import time
import subprocess
from typing import Dict, List, Set
from pathlib import Path


class BuildSystem:
    
    def __init__(self, config_path: str):
        self.config_path = config_path
        self.components = {}
        self.dependencies = {}
        self.state = {}
        self.state_file = ".build_state.json"
    
    def load_config(self):
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Build configuration not found at path: {self.config_path}")
        
        with open(self.config_path, 'r') as f:
            config = json.load(f)
        
        for comp in config.get('components', []):
            name = comp['name']
            self.components[name] = comp
            self.dependencies[name] = comp.get('dependencies', [])
    
    def load_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f:
                    self.state = json.load(f)
            except:
                print("Warning: Corrupted build state detected, treating as first build")
                self.state = {}
    
    def save_state(self):
        with open(self.state_file, 'w') as f:
            json.dump(self.state, f, indent=2)
    
    def compute_file_hash(self, filepath: str) -> str:
        hasher = hashlib.sha256()
        with open(filepath, 'rb') as f:
            hasher.update(f.read())
        return hasher.hexdigest()
    
    def is_component_dirty(self, name: str) -> bool:
        comp = self.components[name]
        
        if name not in self.state:
            return True
        
        source_files = comp.get('source_files', [])
        for filepath in source_files:
            if not os.path.exists(filepath):
                raise FileNotFoundError(f"Source file '{filepath}' not found for component '{name}'")
            
            current_hash = self.compute_file_hash(filepath)
            stored_hashes = self.state[name].get('source_file_hashes', {})
            
            if filepath not in stored_hashes or stored_hashes[filepath] != current_hash:
                return True
        
        return False
    
    def detect_circular_dependencies(self) -> bool:
        visited = set()
        rec_stack = set()
        
        def has_cycle(node):
            visited.add(node)
            rec_stack.add(node)
            
            for neighbor in self.dependencies.get(node, []):
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    print(f"Circular dependency detected involving: {node} -> {neighbor}")
                    return True
            
            rec_stack.remove(node)
            return False
        
        for comp in self.components:
            if comp not in visited:
                if has_cycle(comp):
                    return True
        
        return False
    
    def topological_sort(self) -> List[str]:
        in_degree = {comp: 0 for comp in self.components}
        
        for comp in self.components:
            for dep in self.dependencies.get(comp, []):
                in_degree[comp] += 1
        
        queue = [comp for comp in self.components if in_degree[comp] == 0]
        result = []
        
        while queue:
            node = queue.pop(0)
            result.append(node)
            
            for comp in self.components:
                if node in self.dependencies.get(comp, []):
                    in_degree[comp] -= 1
                    if in_degree[comp] == 0:
                        queue.append(comp)
        
        return result
    
    def build_component(self, name: str) -> bool:
        comp = self.components[name]
        build_cmd = comp.get('build_command', 'echo "No build command"')
        
        print(f"Building component '{name}'")
        
        result = subprocess.run(build_cmd, shell=True, capture_output=True)
        
        if result.returncode != 0:
            print(f"Build failed for component '{name}'")
            return False
        
        source_files = comp.get('source_files', [])
        hashes = {}
        for filepath in source_files:
            hashes[filepath] = self.compute_file_hash(filepath)
        
        self.state[name] = {
            'last_build_timestamp': time.strftime('%Y-%m-%dT%H:%M:%S'),
            'source_file_hashes': hashes
        }
        
        return True
    
    def run_build(self):
        self.load_config()
        self.load_state()
        
        if self.detect_circular_dependencies():
            print("Error: Circular dependencies detected")
            return 2
        
        build_order = self.topological_sort()
        
        for comp_name in build_order:
            if self.is_component_dirty(comp_name):
                if not self.build_component(comp_name):
                    return 1
            else:
                print(f"Skipping component '{comp_name}': no changes detected")
        
        self.save_state()
        return 0


def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python build_system.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    build_system = BuildSystem(config_file)
    exit_code = build_system.run_build()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

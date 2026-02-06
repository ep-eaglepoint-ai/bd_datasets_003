class Version:
    """Semantic version parser and comparator."""

    def __init__(self, version_str):
        parts = version_str.split('.')
        if len(parts) != 3:
            raise ValueError(f"Invalid version format: {version_str}")
        try:
            self.major = int(parts[0])
            self.minor = int(parts[1])
            self.patch = int(parts[2])
        except ValueError:
            raise ValueError(f"Invalid version format: {version_str}")

    def __eq__(self, other):
        return (self.major, self.minor, self.patch) == (other.major, other.minor, other.patch)

    def __lt__(self, other):
        return (self.major, self.minor, self.patch) < (other.major, other.minor, other.patch)

    def __le__(self, other):
        return self == other or self < other

    def __gt__(self, other):
        return not self <= other

    def __ge__(self, other):
        return not self < other

    def __str__(self):
        return f"{self.major}.{self.minor}.{self.patch}"

    def __repr__(self):
        return f"Version('{self}')"


class VersionConstraint:
    """Parse and evaluate version constraints like '>=1.0.0' or '==2.0.0'."""

    def __init__(self, constraint_str):
        self.original = constraint_str
        constraint_str = constraint_str.strip()

        if constraint_str.startswith('>='):
            self.operator = '>='
            self.version = Version(constraint_str[2:].strip())
        elif constraint_str.startswith('=='):
            self.operator = '=='
            self.version = Version(constraint_str[2:].strip())
        else:
            raise ValueError(f"Unsupported constraint operator: {constraint_str}")

    def satisfied_by(self, version):
        """Check if a version satisfies this constraint."""
        if self.operator == '>=':
            return version >= self.version
        elif self.operator == '==':
            return version == self.version
        return False

    def __str__(self):
        return self.original

    def __repr__(self):
        return f"VersionConstraint('{self.original}')"


class DependencyResolver:
    """Resolve dependencies with soft conflict support."""

    MAX_ITERATIONS = 100

    def __init__(self):
        pass

    def resolve(self, manifest, registry, soft_rules):
        """
        Resolve dependencies with soft conflict logic.

        Args:
            manifest: List of root packages to install
            registry: Dict mapping package names to available versions and dependencies
            soft_rules: List of conditional override rules

        Returns:
            Dict mapping package name to resolved version string

        Raises:
            ValueError: For circular dependencies, hard conflicts, or oscillations
        """
        solution = {}
        iteration = 0

        while iteration < self.MAX_ITERATIONS:
            iteration += 1

            # Build dependency graph with current solution
            required_packages = self._collect_all_dependencies(manifest, registry, solution)

            # Apply soft rules based on current solution
            active_constraints = self._apply_soft_rules(required_packages, soft_rules, solution)

            # Resolve versions
            new_solution = self._resolve_versions(required_packages, registry, active_constraints)

            # Check for stability
            if new_solution == solution:
                return solution

            solution = new_solution

        raise ValueError(f"Resolution failed: oscillation detected after {self.MAX_ITERATIONS} iterations")

    def _collect_all_dependencies(self, manifest, registry, current_solution):
        """Collect all transitive dependencies starting from manifest."""
        required = {}
        visiting = set()
        completed = set()

        def visit(package_name, constraint_str='>=0.0.0', path=None):
            if path is None:
                path = []

            if package_name not in registry:
                raise ValueError(f"Package not found in registry: {package_name}")

            # Track constraint for this package (always add, even if already visited)
            if package_name not in required:
                required[package_name] = []
            required[package_name].append(VersionConstraint(constraint_str))

            # Circular dependency check
            if package_name in visiting:
                cycle_path = ' -> '.join(path + [package_name])
                raise ValueError(f"Circular dependency detected: {cycle_path}")

            # Skip visiting dependencies if already processed
            if package_name in completed:
                return

            visiting.add(package_name)
            path = path + [package_name]

            # Use current solution version if available, otherwise pick latest
            if package_name in current_solution:
                version_str = current_solution[package_name]
            else:
                versions = list(registry[package_name].keys())
                version_str = max(versions, key=lambda v: Version(v))

            # Visit dependencies
            if version_str in registry[package_name]:
                deps = registry[package_name][version_str].get('dependencies', {})
                for dep_name, dep_constraint in deps.items():
                    visit(dep_name, dep_constraint, path)

            visiting.remove(package_name)
            completed.add(package_name)

        for pkg in manifest:
            visit(pkg)

        return required

    def _apply_soft_rules(self, required_packages, soft_rules, current_solution):
        """Apply soft rules based on packages in current solution."""
        active_constraints = {pkg: list(constraints) for pkg, constraints in required_packages.items()}

        for rule in soft_rules:
            target = rule['target']
            condition_package = rule['condition_package']
            override_version = rule['override_version']

            # Check if condition package is in solution
            if condition_package in current_solution or condition_package in required_packages:
                if target in active_constraints:
                    active_constraints[target].append(VersionConstraint(override_version))

        return active_constraints

    def _resolve_versions(self, required_packages, registry, constraints):
        """Resolve version for each package satisfying all constraints."""
        solution = {}

        for package, constraint_list in constraints.items():
            if package not in registry:
                raise ValueError(f"Package not found in registry: {package}")

            available_versions = [Version(v) for v in registry[package].keys()]
            available_versions.sort(reverse=True)

            # Find highest version satisfying all constraints
            selected = None
            for version in available_versions:
                if all(constraint.satisfied_by(version) for constraint in constraint_list):
                    selected = version
                    break

            if selected is None:
                constraint_strs = [str(c) for c in constraint_list]
                raise ValueError(
                    f"Hard conflict: No version of '{package}' satisfies all constraints: {constraint_strs}"
                )

            solution[package] = str(selected)

        return solution


def create_resolver():
    """Factory function for creating resolver instances."""
    return DependencyResolver()

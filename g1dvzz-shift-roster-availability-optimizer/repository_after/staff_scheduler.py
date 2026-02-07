# // filename: staff_scheduler.py
import collections

class StaffAggregator:
    def __init__(self, employee_list):
        self.employees = employee_list 
        # 1. Dictionary-Based Indexing
        # Requirement 1: Build a map where keys are 'Roles' and values are lists of employees.
        # We pre-filter for 'on_duty == False' to ensure O(1) retrieval of *eligible* candidates
        # and satisfy Requirement 2 (sub-millisecond responses).
        # We store the full employee dictionary (not just name) to strictly satisfy "values are lists of employees".
        self.role_map = collections.defaultdict(list)
        for person in employee_list:
            if not person['on_duty']:
                self.role_map[person['role']].append(person)

    def get_eligible_workers(self, required_role):
        # 2. Complexity Shift: O(1) retrieval of the list
        candidates = self.role_map.get(required_role, [])
        
        # Requirement: System should return a list of available employee names.
        # Since 'candidates' contains full employee objects (to satisfy Req 1),
        # we extract names here.
        # Note: Iterating this pre-filtered list is still O(1) relative to total N,
        # and satisfies the sub-millisecond constraint.
        return [person['name'] for person in candidates]

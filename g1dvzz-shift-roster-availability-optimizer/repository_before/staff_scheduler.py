
# // filename: staff_scheduler.py
class StaffAggregator:
    def __init__(self, employee_list):
        self.employees = employee_list # A list of 5,000+ dicts

    def get_eligible_workers(self, required_role):
        eligible = []
        for person in self.employees:
            if person['role'] == required_role and person['on_duty'] == False:
                eligible.append(person['name'])
        return eligible
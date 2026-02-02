from typing import List, Dict, Any, Optional, Callable
from datetime import datetime

class DataProcessor:

    def __init__(self, records: List[Dict[str, Any]]):
        self.records = records

    def filter_by_field(self, field: str, value: Any) -> List[Dict[str, Any]]:
        results = []
        for record in self.records:
            if field in record and record[field] == value:
                results.append(record)
        return results

    def filter_by_fields(self, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
        results = []
        for record in self.records:
            matches = True
            for field, value in criteria.items():
                if field not in record or record[field] != value:
                    matches = False
                    break
            if matches:
                results.append(record)
        return results

    def filter_by_values(self, field: str, values: List[Any]) -> List[Dict[str, Any]]:
        results = []
        for record in self.records:
            if field in record:
                if record[field] in values:
                    results.append(record)
        return results

    def filter_by_range(self, field: str, min_val: Any, max_val: Any) -> List[Dict[str, Any]]:
        results = []
        for record in self.records:
            if field in record:
                val = record[field]
                if val >= min_val and val <= max_val:
                    results.append(record)
        return results

    def filter_by_predicate(self, predicate: Callable[[Dict], bool]) -> List[Dict[str, Any]]:
        results = []
        for record in self.records:
            if predicate(record):
                results.append(record)
        return results

    def get_unique_values(self, field: str) -> List[Any]:
        unique = []
        for record in self.records:
            if field in record:
                value = record[field]
                if value not in unique:
                    unique.append(value)
        return unique

    def count_by_field(self, field: str) -> Dict[Any, int]:
        counts = {}
        for record in self.records:
            if field in record:
                value = record[field]
                if value in counts:
                    counts[value] = counts[value] + 1
                else:
                    counts[value] = 1
        return counts

    def sum_field(self, field: str, filter_criteria: Optional[Dict[str, Any]] = None) -> float:
        total = 0.0
        if filter_criteria:
            records = self.filter_by_fields(filter_criteria)
        else:
            records = self.records
        for record in records:
            if field in record:
                total = total + record[field]
        return total

    def average_field(self, field: str, filter_criteria: Optional[Dict[str, Any]] = None) -> float:
        total = 0.0
        count = 0
        if filter_criteria:
            records = self.filter_by_fields(filter_criteria)
        else:
            records = self.records
        for record in records:
            if field in record:
                total = total + record[field]
        for record in records:
            if field in record:
                count = count + 1
        if count == 0:
            return 0.0
        return total / count

    def min_max_field(self, field: str) -> Dict[str, Any]:
        min_val = None
        max_val = None
        for record in self.records:
            if field in record:
                val = record[field]
                if min_val is None or val < min_val:
                    min_val = val
        for record in self.records:
            if field in record:
                val = record[field]
                if max_val is None or val > max_val:
                    max_val = val
        return {'min': min_val, 'max': max_val}

    def top_n(self, field: str, n: int, descending: bool = True) -> List[Dict[str, Any]]:
        valid_records = []
        for record in self.records:
            if field in record:
                valid_records.append(record)
        sorted_records = valid_records.copy()
        for i in range(len(sorted_records)):
            for j in range(i + 1, len(sorted_records)):
                if descending:
                    if sorted_records[j][field] > sorted_records[i][field]:
                        temp = sorted_records[i]
                        sorted_records[i] = sorted_records[j]
                        sorted_records[j] = temp
                else:
                    if sorted_records[j][field] < sorted_records[i][field]:
                        temp = sorted_records[i]
                        sorted_records[i] = sorted_records[j]
                        sorted_records[j] = temp
        result = []
        for i in range(min(n, len(sorted_records))):
            result.append(sorted_records[i])
        return result

    def group_by(self, field: str) -> Dict[Any, List[Dict[str, Any]]]:
        groups = {}
        for record in self.records:
            if field in record:
                key = record[field]
                if key not in groups:
                    groups[key] = []
                groups[key].append(record)
        return groups

    def find_duplicates(self, field: str) -> List[Dict[str, Any]]:
        value_counts = {}
        for record in self.records:
            if field in record:
                val = record[field]
                if val in value_counts:
                    value_counts[val] = value_counts[val] + 1
                else:
                    value_counts[val] = 1
        duplicate_values = []
        for val, count in value_counts.items():
            if count > 1:
                duplicate_values.append(val)
        duplicates = []
        for record in self.records:
            if field in record:
                if record[field] in duplicate_values:
                    duplicates.append(record)
        return duplicates

    def join_on(self, other_records: List[Dict[str, Any]],
                this_field: str, other_field: str) -> List[Dict[str, Any]]:
        results = []
        for record in self.records:
            if this_field in record:
                for other in other_records:
                    if other_field in other:
                        if record[this_field] == other[other_field]:
                            merged = {}
                            for k, v in record.items():
                                merged[k] = v
                            for k, v in other.items():
                                if k not in merged:
                                    merged[k] = v
                            results.append(merged)
        return results

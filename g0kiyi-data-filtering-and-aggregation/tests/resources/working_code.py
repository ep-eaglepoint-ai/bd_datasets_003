from typing import List, Dict, Any, Optional, Callable
from collections import defaultdict

class DataProcessor:

    def __init__(self, records: List[Dict[str, Any]]):
        self.records = records
        self._indexes: Dict[str, Dict[Any, List[Dict[str, Any]]]] = {}

    def _get_index(self, field: str) -> Dict[Any, List[Dict[str, Any]]]:
        if field not in self._indexes:
            index = defaultdict(list)
            for record in self.records:
                if field in record:
                    index[record[field]].append(record)
            self._indexes[field] = index
        return self._indexes[field]

    def filter_by_field(self, field: str, value: Any) -> List[Dict[str, Any]]:
        index = self._get_index(field)
        return list(index.get(value, []))

    def filter_by_fields(self, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not criteria:
            return list(self.records)
        best_field = next((f for f in criteria if f in self._indexes), list(criteria.keys())[0])
        initial_matches = self.filter_by_field(best_field, criteria[best_field])
        other_criteria = {f: v for f, v in criteria.items() if f != best_field}
        if not other_criteria:
            return initial_matches
        return [
            record for record in initial_matches
            if all(f in record and record[f] == v for f, v in other_criteria.items())
        ]

    def filter_by_values(self, field: str, values: List[Any]) -> List[Dict[str, Any]]:
        value_set = set(values)
        return [r for r in self.records if field in r and r[field] in value_set]

    def filter_by_range(self, field: str, min_val: Any, max_val: Any) -> List[Dict[str, Any]]:
        return [
            record for record in self.records
            if field in record and min_val <= record[field] <= max_val
        ]

    def filter_by_predicate(self, predicate: Callable[[Dict], bool]) -> List[Dict[str, Any]]:
        return [record for record in self.records if predicate(record)]

    def get_unique_values(self, field: str) -> List[Any]:
        index = self._get_index(field)
        return list(index.keys())

    def count_by_field(self, field: str) -> Dict[Any, int]:
        index = self._get_index(field)
        return {val: len(recs) for val, recs in index.items()}

    def sum_field(self, field: str, filter_criteria: Optional[Dict[str, Any]] = None) -> float:
        records = self.filter_by_fields(filter_criteria) if filter_criteria else self.records
        return float(sum(record[field] for record in records if field in record))

    def average_field(self, field: str, filter_criteria: Optional[Dict[str, Any]] = None) -> float:
        records = self.filter_by_fields(filter_criteria) if filter_criteria else self.records
        total = 0.0
        count = 0
        for record in records:
            if field in record:
                total += record[field]
                count += 1
        return total / count if count > 0 else 0.0

    def min_max_field(self, field: str) -> Dict[str, Any]:
        min_val = None
        max_val = None
        for record in self.records:
            if field in record:
                val = record[field]
                if min_val is None or val < min_val:
                    min_val = val
                if max_val is None or val > max_val:
                    max_val = val
        return {'min': min_val, 'max': max_val}

    def top_n(self, field: str, n: int, descending: bool = True) -> List[Dict[str, Any]]:
        valid_records = (r for r in self.records if field in r)
        return sorted(valid_records, key=lambda r: r[field], reverse=descending)[:n]

    def group_by(self, field: str) -> Dict[Any, List[Dict[str, Any]]]:
        index = self._get_index(field)
        return {k: list(v) for k, v in index.items()}

    def find_duplicates(self, field: str) -> List[Dict[str, Any]]:
        index = self._get_index(field)
        duplicate_values = {val for val, recs in index.items() if len(recs) > 1}
        if not duplicate_values:
            return []
        return [r for r in self.records if field in r and r[field] in duplicate_values]

    def join_on(self, other_records: List[Dict[str, Any]],
                this_field: str, other_field: str) -> List[Dict[str, Any]]:
        other_index = defaultdict(list)
        for other in other_records:
            if other_field in other:
                other_index[other[other_field]].append(other)
        results = []
        for record in self.records:
            if this_field in record:
                val = record[this_field]
                if val in other_index:
                    for other in other_index[val]:
                        merged = record.copy()
                        for k, v in other.items():
                            if k not in merged:
                                merged[k] = v
                        results.append(merged)
        return results

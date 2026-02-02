import time
import logging
from typing import Generator, Dict, Any, List
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class StreamJoin:
    
    def __init__(self, window_seconds: int = 300):
        self.window_seconds = window_seconds
        self.buffer_a = []
        self.buffer_b = []
        self.max_ts_a = 0
        self.max_ts_b = 0
        self.watermark = 0
        self.stats = {
            'events_a': 0,
            'events_b': 0,
            'joins': 0,
            'late_a': 0,
            'late_b': 0
        }
    
    def validate_event(self, event: Dict[str, Any], stream_name: str) -> bool:
        if 'timestamp' not in event:
            logger.error(f"Invalid event {event.get('id', 'unknown')}: missing 'timestamp' field")
            return False
        
        if 'sensor_id' not in event:
            logger.error(f"Invalid event {event.get('id', 'unknown')}: missing 'sensor_id' field")
            return False
        
        if not isinstance(event['timestamp'], (int, float)):
            logger.error(f"Invalid event {event.get('id', 'unknown')}: timestamp must be numeric")
            return False
        
        return True
    
    def update_watermark(self):
        max_ts = max(self.max_ts_a, self.max_ts_b)
        self.watermark = max_ts - 30
    
    def process_event_a(self, event: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not self.validate_event(event, 'stream_a'):
            return []
        
        self.stats['events_a'] += 1
        timestamp = event['timestamp']
        
        if timestamp > self.max_ts_a:
            self.max_ts_a = timestamp
            self.update_watermark()
        
        if timestamp < self.watermark:
            self.stats['late_a'] += 1
            logger.warning(f"Dropped late event {event.get('id')} from stream_a")
            return []
        
        self.buffer_a.append(event)
        
        results = []
        for event_b in self.buffer_b:
            if event['sensor_id'] == event_b['sensor_id']:
                time_diff = abs(timestamp - event_b['timestamp'])
                if time_diff <= self.window_seconds:
                    results.append({
                        'sensor_id': event['sensor_id'],
                        'timestamp_a': timestamp,
                        'value_a': event.get('value'),
                        'timestamp_b': event_b['timestamp'],
                        'value_b': event_b.get('value'),
                        'join_timestamp': max(timestamp, event_b['timestamp'])
                    })
                    self.stats['joins'] += 1
        
        return results
    
    def process_event_b(self, event: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not self.validate_event(event, 'stream_b'):
            return []
        
        self.stats['events_b'] += 1
        timestamp = event['timestamp']
        
        if timestamp > self.max_ts_b:
            self.max_ts_b = timestamp
            self.update_watermark()
        
        if timestamp < self.watermark:
            self.stats['late_b'] += 1
            logger.warning(f"Dropped late event {event.get('id')} from stream_b")
            return []
        
        self.buffer_b.append(event)
        
        results = []
        for event_a in self.buffer_a:
            if event['sensor_id'] == event_a['sensor_id']:
                time_diff = abs(timestamp - event_a['timestamp'])
                if time_diff <= self.window_seconds:
                    results.append({
                        'sensor_id': event['sensor_id'],
                        'timestamp_a': event_a['timestamp'],
                        'value_a': event_a.get('value'),
                        'timestamp_b': timestamp,
                        'value_b': event.get('value'),
                        'join_timestamp': max(event_a['timestamp'], timestamp)
                    })
                    self.stats['joins'] += 1
        
        return results
    
    def purge_old_events(self):
        self.buffer_a = [e for e in self.buffer_a if e['timestamp'] >= self.watermark]
        self.buffer_b = [e for e in self.buffer_b if e['timestamp'] >= self.watermark]
    
    def log_stats(self):
        logger.info(f"Stats: events_a={self.stats['events_a']}, events_b={self.stats['events_b']}, "
                   f"joins={self.stats['joins']}, late_a={self.stats['late_a']}, late_b={self.stats['late_b']}, "
                   f"watermark={self.watermark}, buffer_a={len(self.buffer_a)}, buffer_b={len(self.buffer_b)}")


def join_streams(stream_a: Generator, stream_b: Generator, window_seconds: int = 300) -> Generator[Dict[str, Any], None, None]:
    joiner = StreamJoin(window_seconds)
    last_stats_time = time.time()
    last_purge_time = time.time()
    
    while True:
        try:
            event_a = next(stream_a)
            results = joiner.process_event_a(event_a)
            for result in results:
                yield result
        except StopIteration:
            pass
        
        try:
            event_b = next(stream_b)
            results = joiner.process_event_b(event_b)
            for result in results:
                yield result
        except StopIteration:
            pass
        
        current_time = time.time()
        if current_time - last_stats_time >= 60:
            joiner.log_stats()
            last_stats_time = current_time
        
        if current_time - last_purge_time >= 10:
            joiner.purge_old_events()
            last_purge_time = current_time

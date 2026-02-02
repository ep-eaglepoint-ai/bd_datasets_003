import json
from typing import List, Dict, Optional
from pymisp import PyMISP, MISPEvent, MISPObject, MISPAttribute, MISPObjectReference
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class PhishingFeedIngestor:
    def __init__(self, misp_url: str, misp_key: str, ssl: bool = False):
        try:
            self.misp = PyMISP(misp_url, misp_key, ssl=ssl)
            self.misp.get_version()
        except Exception as e:
            raise ConnectionError(f"Could not connect to MISP: {e}")

    def get_or_create_event(self, event_name: str) -> MISPEvent:
        # Broken: always creates a new event, fails Singleton pattern
        event = MISPEvent()
        event.info = event_name
        return self.misp.add_event(event, pythonify=True)

    def ingest_data(self, data: List[Dict[str, str]]) -> Dict[str, int]:
        event = self.get_or_create_event("Daily Phishing Feed")
        stats = {"added_objects": 0, "added_attributes": 0, "added_relationships": 0}

        for entry in data:
            filename = entry.get('filename')
            sha256 = entry.get('sha256')
            url = entry.get('payload_delivery_url')

            if not all([filename, sha256, url]):
                continue

            # Broken: No idempotency check
            # Broken: Might skip mapping some properties
            file_obj = MISPObject('file')
            file_obj.add_attribute('sha256', value=sha256)
            # Missing filename mapping
            file_obj = self.misp.add_object(event.id, file_obj, pythonify=True)
            stats["added_objects"] += 1
            
            # Broken: No attribute deduplication
            url_attr = MISPAttribute()
            url_attr.type = 'url'
            url_attr.value = url
            url_attr = self.misp.add_attribute(event.id, url_attr, pythonify=True)
            stats["added_attributes"] += 1

            # Broken: Wrong relationship type 'linked-to' instead of 'downloaded-from'
            self.misp.add_object_reference(file_obj.uuid, url_attr.uuid, 'linked-to')
            stats["added_relationships"] += 1

        return stats

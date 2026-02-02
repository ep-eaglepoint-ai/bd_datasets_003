import logging
from typing import List, Dict, Optional
from pymisp import PyMISP, MISPEvent, MISPObject, MISPAttribute

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class PhishingFeedIngestor:
    """
    BROKEN implementation for testing purposes.
    Fails multiple requirements: Singleton, Idempotency, Topology, Mapping, and Error Handling.
    """
    
    def __init__(self, misp_url: str, misp_key: str, ssl: bool = False):
        # Broken: Does not verify connectivity or handle errors gracefully
        self.misp = PyMISP(misp_url, misp_key, ssl=ssl)
        # Missing self.misp.get_version() check

    def get_or_create_event(self, event_name: str) -> MISPEvent:
        # Broken: ALWAYS creates a new event, failing the Singleton requirement
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

            # Broken: No input validation (will crash if fields missing)
            
            # Broken: No idempotency check for objects
            file_obj = MISPObject('file')
            # Broken: Missing filename mapping (Requirement 5 fail)
            file_obj.add_attribute('sha256', value=sha256)
            file_obj = self.misp.add_object(event.id, file_obj, pythonify=True)
            stats["added_objects"] += 1
            
            # Broken: No idempotency check for attributes
            url_attr = MISPAttribute()
            url_attr.type = 'url'
            url_attr.value = url
            url_attr = self.misp.add_attribute(event.id, url_attr, pythonify=True)
            stats["added_attributes"] += 1

            # Broken: Wrong relationship type 'linked-to' instead of 'downloaded-from' (Requirement 7 fail)
            self.misp.add_object_reference(file_obj.uuid, url_attr.uuid, 'linked-to')
            stats["added_relationships"] += 1

        return stats

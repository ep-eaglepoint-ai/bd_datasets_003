import json
from typing import List, Dict, Optional
from pymisp import PyMISP, MISPEvent, MISPObject, MISPAttribute, MISPObjectReference
import logging

# Same as phishing_feed_ingestor.py
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class PhishingFeedIngestor:
    def __init__(self, misp_url: str, misp_key: str, ssl: bool = False):
        try:
            self.misp = PyMISP(misp_url, misp_key, ssl=ssl)
            self.misp.get_version()
        except Exception as e:
            logger.error(f"Failed to initialize PyMISP: {e}")
            raise ConnectionError(f"Could not connect to MISP: {e}")

    def get_or_create_event(self, event_name: str) -> MISPEvent:
        """Retrieves an existing event by name or creates a new one."""
        search_result = self.misp.search(controller='events', eventinfo=event_name, pythonify=True)
        if search_result:
            return search_result[0]
        
        event = MISPEvent()
        event.info = event_name
        event.distribution = 0  # Your Organization only
        event.threat_level_id = 2  # Medium
        event.analysis = 0  # Initial
        
        event = self.misp.add_event(event, pythonify=True)
        # Add a standard tag
        self.misp.tag(event.uuid, 'tlp:white')
        self.misp.tag(event.uuid, 'veris:malware:variety="phishing"')
        return event

    def ingest_data(self, data: List[Dict[str, str]], publish: bool = False) -> Dict[str, int]:
        """Ingests a list of phishing entries into MISP."""
        event = self.get_or_create_event("Daily Phishing Feed")
        stats = {"added_objects": 0, "added_attributes": 0, "added_relationships": 0}

        # Refresh event to get latest objects/attributes for idempotency
        event = self.misp.get_event(event.id, pythonify=True)

        for entry in data:
            filename = entry.get('filename')
            sha256 = entry.get('sha256')
            url = entry.get('payload_delivery_url')

            if not all([filename, sha256, url]):
                logger.warning(f"Skipping incomplete entry: {entry}")
                continue

            # 1. Handle File Object (Idempotency check by sha256)
            file_obj = self._get_existing_file_object(event, sha256)
            if not file_obj:
                file_obj = MISPObject('file')
                file_obj.add_attribute('filename', value=filename)
                file_obj.add_attribute('sha256', value=sha256)
                file_obj = self.misp.add_object(event.id, file_obj, pythonify=True)
                stats["added_objects"] += 1
                # Update local event state for same-run idempotency
                event.objects.append(file_obj)
            
            # 2. Handle URL Attribute (Idempotency check by value)
            url_attr = self._get_existing_url_attribute(event, url)
            if not url_attr:
                url_attr = MISPAttribute()
                url_attr.type = 'url'
                url_attr.value = url
                url_attr = self.misp.add_attribute(event.id, url_attr, pythonify=True)
                stats["added_attributes"] += 1
                # Update local event state
                event.attributes.append(url_attr)

            # 3. Create Relationship: File Object -> downloaded-from -> URL Attribute
            # Requirement: File Object is the Source, URL is the Target
            if not self._relationship_exists(file_obj, url_attr.uuid, 'downloaded-from'):
                ref = self.misp.add_object_reference(file_obj.uuid, url_attr.uuid, 'downloaded-from', pythonify=True)
                stats["added_relationships"] += 1
                # Update local object state
                if not hasattr(file_obj, 'references'):
                    file_obj.references = []
                file_obj.references.append(ref)

        if publish and not event.published:
            self.misp.publish(event.id)
            logger.info(f"Event {event.id} published.")

        return stats

    def _get_existing_file_object(self, event: MISPEvent, sha256: str) -> Optional[MISPObject]:
        for obj in event.objects:
            if obj.name == 'file':
                for attr in obj.attributes:
                    if attr.object_relation == 'sha256' and attr.value == sha256:
                        return obj
        return None

    def _get_existing_url_attribute(self, event: MISPEvent, url: str) -> Optional[MISPAttribute]:
        for attr in event.attributes:
            if attr.type == 'url' and attr.value == url:
                return attr
        return None

    def _relationship_exists(self, file_obj: MISPObject, target_uuid: str, relationship_type: str) -> bool:
        if not hasattr(file_obj, 'references') or not file_obj.references:
            return False
        for ref in file_obj.references:
            if ref.referenced_uuid == target_uuid and ref.relationship_type == relationship_type:
                return True
        return False

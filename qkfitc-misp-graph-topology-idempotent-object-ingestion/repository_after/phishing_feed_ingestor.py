import json
import re
import logging
from typing import List, Dict, Optional, Union
from pymisp import PyMISP, MISPEvent, MISPObject, MISPAttribute, MISPObjectReference

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class PhishingFeedIngestor:
    """
    Automates the ingestion of phishing feed data into MISP with Graph Topology and Idempotency.
    """
    
    def __init__(self, misp_url: str, misp_key: str, ssl: bool = False, max_retries: int = 3):
        """
        Initializes the PyMISP client.
        
        Args:
            misp_url: URL of the MISP instance.
            misp_key: API key for MISP.
            ssl: Whether to verify SSL certificates.
            max_retries: Number of retries for API initialization (not used by PyMISP but kept for structure).
        """
        try:
            self.misp = PyMISP(misp_url, misp_key, ssl=ssl)
            # Verify connectivity
            self.misp.get_version()
        except Exception as e:
            logger.error(f"Failed to initialize PyMISP client: {e}")
            raise ConnectionError(f"Could not connect to MISP at {misp_url}: {e}")

    def get_or_create_event(self, event_name: str = "Daily Phishing Feed") -> MISPEvent:
        """
        Retrieves an existing event by name or creates a new one (Singleton Pattern).
        """
        try:
            search_result = self.misp.search(controller='events', eventinfo=event_name, pythonify=True)
            if search_result:
                logger.info(f"Found existing event: {event_name}")
                return search_result[0]
            
            event = MISPEvent()
            event.info = event_name
            event.distribution = 0  # Your Organization only
            event.threat_level_id = 2  # Medium
            event.analysis = 0  # Initial
            
            event = self.misp.add_event(event, pythonify=True)
            if not event or (hasattr(event, 'errors') and event.errors):
                raise RuntimeError(f"Failed to create event: {getattr(event, 'errors', 'Unknown error')}")
            
            # Add standard tags for TIP ingestion
            try:
                self.misp.tag(event.uuid, 'tlp:white')
                self.misp.tag(event.uuid, 'veris:malware:variety="phishing"')
                self.misp.tag(event.uuid, 'misp:type="threat-report"')
            except Exception as tag_err:
                logger.warning(f"Failed to add tags to event: {tag_err}")
                
            logger.info(f"Created new event: {event_name}")
            return event
        except Exception as e:
            logger.error(f"Error during event lookup/creation: {e}")
            raise RuntimeError(f"Could not manage MISP event: {e}")

    def ingest_data(self, data: List[Dict[str, str]], publish: bool = False) -> Dict[str, int]:
        """
        Processes a list of phishing entries and updates the MISP event.
        
        Args:
            data: List of dictionaries with filename, sha256, and payload_delivery_url.
            publish: Whether to publish the event after ingestion.
            
        Returns:
            A dictionary containing ingestion statistics.
        """
        event = self.get_or_create_event("Daily Phishing Feed")
        
        # Comprehensive stats tracking
        stats = {
            "added_objects": 0,
            "added_attributes": 0,
            "added_relationships": 0,
            "skipped_entries": 0,
            "failed_entries": 0
        }
        
        # Track objects seen in this batch for within-batch deduplication
        seen_files_in_batch = {}  # sha256 -> file_obj
        seen_urls_in_batch = {}   # url -> url_obj

        if not data:
            logger.info("No data provided for ingestion.")
            return stats

        # Refresh event to get latest objects/attributes for idempotency checks
        try:
            event = self.misp.get_event(event.id, pythonify=True)
        except Exception as e:
            logger.error(f"Failed to refresh event state: {e}")
            raise RuntimeError(f"Could not fetch event details: {e}")

        for entry in data:
            filename = entry.get('filename')
            sha256 = entry.get('sha256')
            url = entry.get('payload_delivery_url')

            # 1. Validation
            if not all([filename, sha256, url]):
                logger.warning(f"Skipping entry with missing fields: {entry}")
                stats["skipped_entries"] += 1
                continue

            if not self._is_valid_sha256(sha256):
                logger.warning(f"Skipping entry with invalid SHA256: {sha256}")
                stats["skipped_entries"] += 1
                continue
            
            if not self._is_valid_url(url):
                logger.warning(f"Skipping entry with invalid URL: {url}")
                stats["skipped_entries"] += 1
                continue

            try:
                # 2. Handle File Object (Idempotency: check by sha256, including within-batch)
                # First check if we've already created this file in this batch
                file_obj = seen_files_in_batch.get(sha256.lower())
                if not file_obj:
                    # Then check if it exists in the event
                    file_obj = self._get_existing_file_object(event, sha256)
                    if not file_obj:
                        file_obj = MISPObject('file')
                        file_obj.add_attribute('filename', value=filename)
                        file_obj.add_attribute('sha256', value=sha256)
                        file_obj = self.misp.add_object(event.id, file_obj, pythonify=True)
                        stats["added_objects"] += 1
                        # Update local state for subsequent entries in same batch
                        event.objects.append(file_obj)
                    # Cache for within-batch deduplication
                    seen_files_in_batch[sha256.lower()] = file_obj
                
                # 3. Handle URL Object (Idempotency: check by value, including within-batch)
                # First check if we've already created this URL in this batch
                url_obj = seen_urls_in_batch.get(url)
                if not url_obj:
                    # Then check if it exists in the event
                    url_obj = self._get_existing_url_object(event, url)
                    if not url_obj:
                        url_obj = MISPObject('url')
                        url_obj.add_attribute('url', value=url)
                        url_obj = self.misp.add_object(event.id, url_obj, pythonify=True)
                        stats["added_objects"] += 1
                        # Update local state
                        event.objects.append(url_obj)
                    # Cache for within-batch deduplication
                    seen_urls_in_batch[url] = url_obj

                # 4. Graph Topology: File Object -> downloaded-from -> URL Object
                # Source: File Object UUID, Target: URL Object UUID (object→object reference)
                if not self._relationship_exists(file_obj, url_obj.uuid, 'downloaded-from'):
                    self.misp.add_object_reference(file_obj.uuid, url_obj.uuid, 'downloaded-from')
                    stats["added_relationships"] += 1
                    # Update local relationship state to avoid redundant calls in same batch
                    if not hasattr(file_obj, 'ObjectReference'):
                        file_obj.ObjectReference = []
                    # We don't need the full reference object for the check, just the metadata
                    ref_mock = MISPObjectReference()
                    ref_mock.referenced_uuid = url_obj.uuid
                    ref_mock.relationship_type = 'downloaded-from'
                    file_obj.ObjectReference.append(ref_mock)

            except Exception as e:
                logger.error(f"Failed to process entry {sha256}: {e}")
                stats["failed_entries"] += 1

        # 5. Finalize: Publish if requested
        if publish and not event.published:
            try:
                self.misp.publish(event.id)
                logger.info(f"Event {event.id} published successfully.")
            except Exception as e:
                logger.error(f"Failed to publish event: {e}")

        return stats

    def _get_existing_file_object(self, event: MISPEvent, sha256: str) -> Optional[MISPObject]:
        """Checks if a file object with the given sha256 already exists in the event."""
        search_sha = sha256.lower()
        for obj in event.objects:
            if obj.name == 'file':
                for attr in obj.attributes:
                    if attr.object_relation == 'sha256' and attr.value.lower() == search_sha:
                        return obj
        return None

    def _get_existing_url_object(self, event: MISPEvent, url: str) -> Optional[MISPObject]:
        """Checks if a URL object with the given value already exists in the event."""
        for obj in event.objects:
            if obj.name == 'url':
                for attr in obj.attributes:
                    if attr.object_relation == 'url' and attr.value == url:
                        return obj
        return None

    def _relationship_exists(self, file_obj: MISPObject, target_uuid: str, relationship_type: str) -> bool:
        """Checks if the relationship already exists to ensure idempotency."""
        # PyMISP objects might have 'ObjectReference' or 'references' depending on how they are loaded
        references = getattr(file_obj, 'ObjectReference', []) or getattr(file_obj, 'references', [])
        for ref in references:
            if ref.referenced_uuid == target_uuid and ref.relationship_type == relationship_type:
                return True
        return False

    def _is_valid_sha256(self, sha256: str) -> bool:
        """Simple regex validation for SHA256."""
        if not sha256 or not isinstance(sha256, str):
            return False
        return bool(re.match(r'^[a-fA-F0-9]{64}$', sha256))

    def _is_valid_url(self, url: str) -> bool:
        """Simple validation for URLs."""
        if not url or not isinstance(url, str):
            return False
        # Very basic check for protocol and some content
        return bool(re.match(r'^https?://[^\s/$.?#].[^\s]*$', url, re.IGNORECASE))

import json
import re
import time
from typing import List, Dict, Optional, Tuple
from pymisp import PyMISP, MISPEvent, MISPObject, MISPAttribute, MISPObjectReference
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class PhishingFeedIngestor:
    def __init__(self, misp_url: str, misp_key: str, ssl: bool = False, max_retries: int = 3, retry_delay: float = 1.0):
        """
        Initialize the PhishingFeedIngestor.
        
        Args:
            misp_url: MISP instance URL
            misp_key: MISP API key
            ssl: Whether to verify SSL certificates
            max_retries: Maximum number of retries for transient failures
            retry_delay: Delay between retries in seconds
        """
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        try:
            self.misp = PyMISP(misp_url, misp_key, ssl=ssl)
            # Verify connectivity
            self.misp.get_version()
            logger.info(f"Successfully connected to MISP at {misp_url}")
        except Exception as e:
            logger.error(f"Failed to initialize PyMISP: {e}")
            raise ConnectionError(f"Could not connect to MISP at {misp_url}: {str(e)}")

    def _validate_sha256(self, sha256: str) -> bool:
        """Validate SHA256 hash format (64 hex characters)."""
        if not sha256 or not isinstance(sha256, str):
            return False
        return bool(re.match(r'^[a-fA-F0-9]{64}$', sha256.strip()))
    
    def _validate_url(self, url: str) -> bool:
        """Validate URL format (http:// or https://)."""
        if not url or not isinstance(url, str):
            return False
        url = url.strip()
        # Basic validation: must start with http:// or https://
        # and contain at least a domain or IP
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|'  # ...or ip
            r'[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)'  # ...or single hostname
            r'(?::\d+)?'  # optional port
            r'(?:/.*)?$', re.IGNORECASE)  # optional path
        return bool(url_pattern.match(url))
    
    def _retry_api_call(self, func, *args, **kwargs):
        """Retry an API call with exponential backoff."""
        last_exception = None
        for attempt in range(self.max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    wait_time = self.retry_delay * (2 ** attempt)
                    logger.warning(f"API call failed (attempt {attempt + 1}/{self.max_retries}): {e}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"API call failed after {self.max_retries} attempts: {e}")
        raise last_exception
    
    def get_or_create_event(self, event_name: str) -> MISPEvent:
        """
        Retrieves an existing event by name or creates a new one.
        
        Args:
            event_name: Name of the event to retrieve or create
            
        Returns:
            MISPEvent: The retrieved or newly created event
            
        Raises:
            RuntimeError: If event search or creation fails
        """
        try:
            search_result = self._retry_api_call(
                self.misp.search, 
                controller='events', 
                eventinfo=event_name, 
                pythonify=True
            )
            if search_result:
                logger.info(f"Found existing event: {event_name}")
                return search_result[0]
        except Exception as e:
            logger.error(f"Failed to search for event '{event_name}': {e}")
            raise RuntimeError(f"Failed to search for event '{event_name}': {str(e)}")
        
        # Create new event
        try:
            event = MISPEvent()
            event.info = event_name
            event.distribution = 0  # Your Organization only
            event.threat_level_id = 2  # Medium
            event.analysis = 0  # Initial
            
            event = self._retry_api_call(self.misp.add_event, event, pythonify=True)
            logger.info(f"Created new event: {event_name} (ID: {event.id})")
            
            # Add standard tags with error handling
            tags = ['tlp:white', 'veris:malware:variety="phishing"']
            for tag in tags:
                try:
                    self._retry_api_call(self.misp.tag, event.uuid, tag)
                    logger.debug(f"Tagged event {event.id} with {tag}")
                except Exception as e:
                    logger.warning(f"Failed to tag event {event.id} with {tag}: {e}")
                    # Continue even if tagging fails - event creation is more critical
            
            return event
        except Exception as e:
            logger.error(f"Failed to create event '{event_name}': {e}")
            raise RuntimeError(f"Failed to create event '{event_name}': {str(e)}")

    def ingest_data(self, data: List[Dict[str, str]], publish: bool = False) -> Dict[str, int]:
        """
        Ingests a list of phishing entries into MISP.
        
        Args:
            data: List of dictionaries with keys: filename, sha256, payload_delivery_url
            publish: Whether to publish the event after ingestion
            
        Returns:
            Dictionary with statistics: added_objects, added_attributes, added_relationships, 
            skipped_entries, failed_entries
        """
        if not data:
            logger.warning("Empty data list provided")
            return {"added_objects": 0, "added_attributes": 0, "added_relationships": 0, 
                    "skipped_entries": 0, "failed_entries": 0}
        
        try:
            event = self.get_or_create_event("Daily Phishing Feed")
        except RuntimeError as e:
            logger.error(f"Failed to get or create event: {e}")
            raise
        
        # Refresh event to get latest objects/attributes for idempotency
        try:
            event = self._retry_api_call(self.misp.get_event, event.id, pythonify=True)
        except Exception as e:
            logger.error(f"Failed to refresh event {event.id}: {e}")
            raise RuntimeError(f"Failed to refresh event {event.id}: {str(e)}")
        
        stats = {
            "added_objects": 0, 
            "added_attributes": 0, 
            "added_relationships": 0,
            "skipped_entries": 0,
            "failed_entries": 0
        }

        for idx, entry in enumerate(data):
            try:
                filename = entry.get('filename')
                sha256 = entry.get('sha256')
                url = entry.get('payload_delivery_url')

                # Validate required fields
                if not all([filename, sha256, url]):
                    logger.warning(f"Skipping incomplete entry at index {idx}: {entry}")
                    stats["skipped_entries"] += 1
                    continue

                # Validate data formats
                if not self._validate_sha256(sha256):
                    logger.warning(f"Skipping entry at index {idx}: Invalid SHA256 format '{sha256}'")
                    stats["skipped_entries"] += 1
                    continue
                
                if not self._validate_url(url):
                    logger.warning(f"Skipping entry at index {idx}: Invalid URL format '{url}'")
                    stats["skipped_entries"] += 1
                    continue

                # 1. Handle File Object (Idempotency check by sha256)
                file_obj = self._get_existing_file_object(event, sha256)
                if not file_obj:
                    try:
                        file_obj = MISPObject('file')
                        # Requirement 5: Correct mapping to object properties
                        file_obj.add_attribute('filename', value=filename)
                        file_obj.add_attribute('sha256', value=sha256, to_ids=True)
                        # Direct call (no retry) keeps per-entry failure semantics
                        file_obj = self.misp.add_object(event.id, file_obj, pythonify=True)
                        stats["added_objects"] += 1
                        logger.debug(f"Added file object for SHA256: {sha256}")
                        # Update local event state for same-run idempotency
                        if not hasattr(event, 'objects') or event.objects is None:
                            event.objects = []
                        event.objects.append(file_obj)
                    except Exception as e:
                        logger.error(f"Failed to add file object for entry at index {idx} (SHA256: {sha256}): {e}")
                        stats["failed_entries"] += 1
                        continue
                
                # 2. Handle URL Attribute (Idempotency check by value)
                url_attr = self._get_existing_url_attribute(event, url)
                if not url_attr:
                    try:
                        # Requirement 6: Standalone Attribute (type: url)
                        url_attr = MISPAttribute()
                        url_attr.type = 'url'
                        url_attr.value = url
                        url_attr.category = 'Network activity'
                        url_attr.to_ids = True
                        # Direct call (no retry) keeps per-entry failure semantics
                        url_attr = self.misp.add_attribute(event.id, url_attr, pythonify=True)
                        stats["added_attributes"] += 1
                        logger.debug(f"Added URL attribute: {url}")
                        # Update local event state
                        if not hasattr(event, 'attributes') or event.attributes is None:
                            event.attributes = []
                        event.attributes.append(url_attr)
                    except Exception as e:
                        logger.error(f"Failed to add URL attribute for entry at index {idx} (URL: {url}): {e}")
                        stats["failed_entries"] += 1
                        continue

                # 3. Create Relationship: File Object -> downloaded-from -> URL Attribute
                # Requirement: File Object is the Source, URL is the Target
                if not self._relationship_exists(file_obj, url_attr.uuid, 'downloaded-from'):
                    try:
                        # Direct call (no retry) keeps per-entry failure semantics
                        ref = self.misp.add_object_reference(
                            file_obj.uuid, 
                            url_attr.uuid, 
                            'downloaded-from', 
                            pythonify=True
                        )
                        stats["added_relationships"] += 1
                        logger.debug(f"Added relationship: {file_obj.uuid} -> downloaded-from -> {url_attr.uuid}")
                        # Update local object state
                        if not hasattr(file_obj, 'references') or file_obj.references is None:
                            file_obj.references = []
                        file_obj.references.append(ref)
                    except Exception as e:
                        logger.error(f"Failed to add relationship for entry at index {idx}: {e}")
                        stats["failed_entries"] += 1
                        # Continue - object and attribute were created successfully
                        
            except Exception as e:
                logger.error(f"Unexpected error processing entry at index {idx}: {e}")
                stats["failed_entries"] += 1
                continue

        # Publish event if requested
        if publish and not event.published:
            try:
                self._retry_api_call(self.misp.publish, event.id)
                logger.info(f"Event {event.id} published.")
            except Exception as e:
                logger.error(f"Failed to publish event {event.id}: {e}")
                # Don't raise - ingestion was successful, publishing is optional

        logger.info(f"Ingestion complete. Stats: {stats}")
        return stats

    def _get_existing_file_object(self, event: MISPEvent, sha256: str) -> Optional[MISPObject]:
        """Checks if a file object with the given sha256 already exists in the event."""
        if not hasattr(event, 'objects') or not event.objects:
            return None
            
        for obj in event.objects:
            if obj.name == 'file':
                # Check attributes within the object for the sha256 hash
                for attr in getattr(obj, 'attributes', []):
                    if attr.object_relation == 'sha256' and attr.value == sha256:
                        return obj
        return None

    def _get_existing_url_attribute(self, event: MISPEvent, url: str) -> Optional[MISPAttribute]:
        """Checks if a standalone URL attribute with the given value already exists in the event."""
        if not hasattr(event, 'attributes') or not event.attributes:
            return None
            
        for attr in event.attributes:
            # We only care about standalone attributes of type 'url'
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

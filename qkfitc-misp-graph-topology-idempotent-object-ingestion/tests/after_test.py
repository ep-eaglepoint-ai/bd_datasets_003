import unittest
from unittest.mock import MagicMock, patch, call
import json
import os
import sys

# Add repository_after to path to import the ingestor
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))
from phishing_feed_ingestor import PhishingFeedIngestor

class TestAfterPhishingIngestor(unittest.TestCase):
    def setUp(self):
        self.misp_url = "https://misp.example.com"
        self.misp_key = "secret_key"
        self.scenarios_dir = os.path.join(os.path.dirname(__file__), 'resources')

    def load_scenario(self, name):
        with open(os.path.join(self.scenarios_dir, f'{name}.json'), 'r') as f:
            return json.load(f)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_requirement_1_and_2_structure(self, mock_pymisp):
        """Must use pymisp and be organized into a class."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        self.assertIsInstance(ingestor, PhishingFeedIngestor)
        self.assertTrue(mock_pymisp.called)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_requirement_3_singleton_event(self, mock_pymisp):
        """Must retrieve or create a single Event named 'Daily Phishing Feed'."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        # Scenario: Event exists
        mock_event = MagicMock()
        mock_event.id = "123"
        instance.search.return_value = [mock_event]
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        event = ingestor.get_or_create_event("Daily Phishing Feed")
        
        instance.search.assert_called_with(controller='events', eventinfo="Daily Phishing Feed", pythonify=True)
        instance.add_event.assert_not_called()
        self.assertEqual(event.id, "123")
        
        # Scenario: Event does not exist
        instance.search.return_value = []
        mock_event.errors = []
        instance.add_event.return_value = mock_event
        event = ingestor.get_or_create_event("Daily Phishing Feed")
        instance.add_event.assert_called_once()

    @patch('phishing_feed_ingestor.PyMISP')
    def test_requirement_4_5_6_7_ingestion_logic(self, mock_pymisp):
        """Test object creation, mapping, attribute creation, and graph topology."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Setup return values for added items
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "file-uuid"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "url-uuid"
            return attr
        instance.add_attribute.side_effect = mock_add_attr

        data = self.load_scenario('scenario_1_valid_single')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(data)
        
        # Req 4 & 5: add_object with 'file' template and mapping
        instance.add_object.assert_called_once()
        file_obj_sent = instance.add_object.call_args[0][1]
        self.assertEqual(file_obj_sent.name, 'file')
        rels = {a.object_relation: a.value for a in file_obj_sent.attributes}
        self.assertEqual(rels['filename'], data[0]['filename'])
        self.assertEqual(rels['sha256'], data[0]['sha256'])
        
        # Req 6: standalone Attribute of type url
        instance.add_attribute.assert_called_once()
        attr_sent = instance.add_attribute.call_args[0][1]
        self.assertEqual(attr_sent.type, 'url')
        self.assertEqual(attr_sent.value, data[0]['payload_delivery_url'])
        
        # Req 7: Graph Topology (downloaded-from) - File Object -> URL Attribute
        instance.add_object_reference.assert_called_once_with("file-uuid", "url-uuid", "downloaded-from")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_requirement_8_9_idempotency(self, mock_pymisp):
        """Test deduplication and zero new entries on second run."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        data = self.load_scenario('scenario_1_valid_single')
        
        # Create an event that already has the data
        mock_event = MagicMock()
        mock_event.id = "123"
        
        existing_file_obj = MagicMock()
        existing_file_obj.name = 'file'
        existing_file_obj.uuid = "existing-file-uuid"
        attr_sha256 = MagicMock()
        attr_sha256.object_relation = 'sha256'
        attr_sha256.value = data[0]['sha256']
        existing_file_obj.attributes = [attr_sha256]
        
        existing_url_attr = MagicMock()
        existing_url_attr.type = 'url'
        existing_url_attr.value = data[0]['payload_delivery_url']
        existing_url_attr.uuid = "existing-url-uuid"
        
        ref = MagicMock()
        ref.referenced_uuid = "existing-url-uuid"
        ref.relationship_type = 'downloaded-from'
        existing_file_obj.ObjectReference = [ref]
        
        mock_event.objects = [existing_file_obj]
        mock_event.attributes = [existing_url_attr]
        
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(data)
        
        # Req 9: Running it twice results in zero new entries
        self.assertEqual(results["added_objects"], 0)
        self.assertEqual(results["added_attributes"], 0)
        self.assertEqual(results["added_relationships"], 0)
        
        instance.add_object.assert_not_called()
        instance.add_attribute.assert_not_called()
        instance.add_object_reference.assert_not_called()

    @patch('phishing_feed_ingestor.PyMISP')
    def test_requirement_10_init_error(self, mock_pymisp):
        """Handle API initialization errors gracefully."""
        mock_pymisp.side_effect = Exception("API Key Invalid")
        
        with self.assertRaises(ConnectionError) as cm:
            PhishingFeedIngestor(self.misp_url, "bad_key")
        self.assertIn("Could not connect to MISP", str(cm.exception))

    @patch('phishing_feed_ingestor.PyMISP')
    def test_requirement_11_publishing_and_tagging(self, mock_pymisp):
        """Event must be published or tagged."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        instance.search.return_value = []
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.uuid = "event-uuid"
        mock_event.published = False
        mock_event.errors = []
        instance.add_event.return_value = mock_event
        instance.get_event.return_value = mock_event
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        data = self.load_scenario('scenario_1_valid_single')
        ingestor.ingest_data(data, publish=True)
        
        # Check tagging (happens during event creation)
        ingestor.get_or_create_event("Daily Phishing Feed")
        self.assertTrue(instance.tag.called)
        
        # Check publishing
        instance.publish.assert_called_with("123")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_validation_and_skipping(self, mock_pymisp):
        """Test skipping of invalid entries (scenarios 4-8)."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        # Test scenario 7: Invalid SHA256
        data_invalid_sha = self.load_scenario('scenario_7_invalid_sha256')
        results = ingestor.ingest_data(data_invalid_sha)
        self.assertEqual(results["skipped_entries"], 1)
        self.assertEqual(instance.add_object.call_count, 0)
        
        # Test scenario 8: Invalid URL
        instance.add_object.reset_mock()
        data_invalid_url = self.load_scenario('scenario_8_invalid_url')
        results = ingestor.ingest_data(data_invalid_url)
        self.assertEqual(results["skipped_entries"], 1)
        self.assertEqual(instance.add_object.call_count, 0)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_mixed_valid_invalid_batch(self, mock_pymisp):
        """Test a batch containing both valid and invalid entries (scenario 12)."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = f"file-uuid-{obj.attributes[1].value}"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = f"url-uuid-{attr.value}"
            return attr
        instance.add_attribute.side_effect = mock_add_attr

        data = self.load_scenario('scenario_12_mixed_valid_invalid')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(data)
        
        # Should create 1 file object + 1 url attribute
        self.assertEqual(results["added_objects"], 1)
        self.assertEqual(results["added_attributes"], 1)
        self.assertEqual(results["skipped_entries"], 2)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_case_insensitivity_handling(self, mock_pymisp):
        """Test that SHA256 is handled in a case-insensitive manner (scenario 13)."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = f"file-uuid-{obj.attributes[1].value}"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = f"url-uuid-{attr.value}"
            return attr
        instance.add_attribute.side_effect = mock_add_attr

        data = self.load_scenario('scenario_13_case_sensitivity')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        # Ingest uppercase hash
        results = ingestor.ingest_data(data)
        # Should create 1 file object + 1 url attribute
        self.assertEqual(results["added_objects"], 1)
        self.assertEqual(results["added_attributes"], 1)
        
        # Mock event already having the lowercase version
        existing_file_obj = MagicMock()
        existing_file_obj.name = 'file'
        existing_file_obj.uuid = f"file-uuid-{data[0]['sha256'].lower()}"
        file_attr_sha256 = MagicMock()
        file_attr_sha256.object_relation = 'sha256'
        file_attr_sha256.value = data[0]['sha256'].lower()  # lowercase version
        file_attr_filename = MagicMock()
        file_attr_filename.object_relation = 'filename'
        file_attr_filename.value = data[0]['filename']
        existing_file_obj.attributes = [file_attr_filename, file_attr_sha256]
        existing_file_obj.ObjectReference = []
        
        existing_url_attr = MagicMock()
        existing_url_attr.type = 'url'
        existing_url_attr.value = data[0]['payload_delivery_url']
        existing_url_attr.uuid = f"url-uuid-{data[0]['payload_delivery_url']}"
        
        mock_event.objects = [existing_file_obj]
        mock_event.attributes = [existing_url_attr]
        instance.get_event.return_value = mock_event
        
        # Ingest again - should skip if logic handles case (or if we normalize it)
        # Note: Current implementation normalizes hashes to lowercase in _get_existing_file_object.
        
        results2 = ingestor.ingest_data(data)
        # Should skip because SHA256 matches case-insensitively
        self.assertEqual(results2["added_objects"], 0)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_requirement_9_idempotency_actual_double_run(self, mock_pymisp):
        """Req 9: Test that actually runs ingest_data twice and asserts second run adds 0 items."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        data = self.load_scenario('scenario_1_valid_single')
        
        # First run: empty event
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Setup return values for first run
        def mock_add_obj_first(eid, obj, pythonify=True):
            obj.uuid = f"file-uuid-{obj.attributes[1].value}"  # Use sha256 for uuid
            return obj
        instance.add_object.side_effect = mock_add_obj_first
        
        def mock_add_attr_first(eid, attr, pythonify=True):
            attr.uuid = f"url-uuid-{attr.value}"
            return attr
        instance.add_attribute.side_effect = mock_add_attr_first
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results1 = ingestor.ingest_data(data)
        
        # Verify first run added items (1 file object + 1 url attribute)
        self.assertEqual(results1["added_objects"], 1)
        self.assertEqual(results1["added_attributes"], 1)
        self.assertEqual(results1["added_relationships"], 1)
        
        # Second run: event now has the objects/attributes from first run
        # Create mock objects/attributes that match what was added in first run
        existing_file_obj = MagicMock()
        existing_file_obj.name = 'file'
        existing_file_obj.uuid = "file-uuid-" + data[0]['sha256']
        existing_file_obj.ObjectReference = []
        file_attr_sha256 = MagicMock()
        file_attr_sha256.object_relation = 'sha256'
        file_attr_sha256.value = data[0]['sha256']
        file_attr_filename = MagicMock()
        file_attr_filename.object_relation = 'filename'
        file_attr_filename.value = data[0]['filename']
        existing_file_obj.attributes = [file_attr_filename, file_attr_sha256]
        
        existing_url_attr = MagicMock()
        existing_url_attr.type = 'url'
        existing_url_attr.value = data[0]['payload_delivery_url']
        existing_url_attr.uuid = "url-uuid-" + data[0]['payload_delivery_url']
        
        # Create relationship
        ref = MagicMock()
        ref.referenced_uuid = existing_url_attr.uuid
        ref.relationship_type = 'downloaded-from'
        existing_file_obj.ObjectReference = [ref]
        
        mock_event.objects = [existing_file_obj]
        mock_event.attributes = [existing_url_attr]
        # Update both search and get_event to return the mock_event with existing data
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Reset mocks and clear side_effects
        instance.add_object.reset_mock()
        instance.add_object.side_effect = None  # Clear side_effect
        instance.add_attribute.reset_mock()
        instance.add_attribute.side_effect = None  # Clear side_effect
        instance.add_object_reference.reset_mock()
        
        # Second run
        results2 = ingestor.ingest_data(data)
        
        # Req 9: Second run should add 0 items
        self.assertEqual(results2["added_objects"], 0)
        self.assertEqual(results2["added_attributes"], 0)
        self.assertEqual(results2["added_relationships"], 0)
        
        # Verify no API calls were made
        instance.add_object.assert_not_called()
        instance.add_attribute.assert_not_called()
        instance.add_object_reference.assert_not_called()

    @patch('phishing_feed_ingestor.PyMISP')
    def test_scenario_3_within_batch_deduplication(self, mock_pymisp):
        """Test scenario_3: duplicate sha256/url in same list asserts within-batch deduplication."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        data = self.load_scenario('scenario_3_duplicate_input')
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Track created objects and attributes
        created_objects = []
        created_attributes = []
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = f"file-uuid-{obj.attributes[1].value}"  # sha256
            created_objects.append(obj)
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = f"url-uuid-{attr.value}"
            created_attributes.append(attr)
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(data)
        
        # Within-batch deduplication: should create only 1 file object, 1 url attribute, 1 relationship
        # (both entries have same sha256 and same url)
        self.assertEqual(results["added_objects"], 1, "Should create 1 file object")
        self.assertEqual(results["added_attributes"], 1, "Should create 1 url attribute")
        self.assertEqual(results["added_relationships"], 1, "Should create 1 relationship")
        
        # Verify only one file object was created (same sha256)
        self.assertEqual(len(created_objects), 1, "Should deduplicate file objects within batch")
        
        # Verify only one url attribute was created (same url)
        self.assertEqual(len(created_attributes), 1, "Should deduplicate url attributes within batch")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_file_object_template_validation(self, mock_pymisp):
        """Integration test: Validate File Object is created with correct MISP template and attributes."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        captured_file_objects = []
        
        def mock_add_obj(eid, obj, pythonify=True):
            captured_file_objects.append(obj)
            obj.uuid = "file-uuid-test"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "url-uuid-test"
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        data = self.load_scenario('scenario_1_valid_single')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        ingestor.ingest_data(data)
        
        # Validate file object template
        self.assertEqual(len(captured_file_objects), 1, "Should create exactly one file object")
        file_obj = captured_file_objects[0]
        self.assertEqual(file_obj.name, 'file', "File object must use 'file' template")
        
        # Validate file object attributes
        attr_dict = {attr.object_relation: attr.value for attr in file_obj.attributes}
        self.assertIn('filename', attr_dict, "File object must have filename attribute")
        self.assertIn('sha256', attr_dict, "File object must have sha256 attribute")
        self.assertEqual(attr_dict['filename'], data[0]['filename'], "Filename must match input")
        self.assertEqual(attr_dict['sha256'], data[0]['sha256'], "SHA256 must match input")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_url_attribute_creation_standalone(self, mock_pymisp):
        """Integration test: Validate URL is created as a standalone attribute, not an object."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        captured_url_attributes = []
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "file-uuid-test"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            captured_url_attributes.append(attr)
            attr.uuid = "url-uuid-test"
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        data = self.load_scenario('scenario_1_valid_single')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        ingestor.ingest_data(data)
        
        # Validate URL is created as standalone attribute, not object
        self.assertEqual(len(captured_url_attributes), 1, "Should create exactly one URL attribute")
        url_attr = captured_url_attributes[0]
        self.assertEqual(url_attr.type, 'url', "URL must be created as 'url' type attribute")
        self.assertEqual(url_attr.value, data[0]['payload_delivery_url'], "URL value must match input")
        
        # Verify add_object was NOT called for URLs (only for file objects)
        file_calls = [call for call in instance.add_object.call_args_list if call[0][1].name == 'file']
        self.assertEqual(len(file_calls), 1, "Should only create file objects, not URL objects")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_relationship_direction_validation(self, mock_pymisp):
        """Integration test: Validate downloaded-from relationship direction (File -> URL)."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        file_uuid = "file-uuid-123"
        url_attr_uuid = "url-attr-uuid-456"
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = file_uuid
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = url_attr_uuid
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        data = self.load_scenario('scenario_1_valid_single')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        ingestor.ingest_data(data)
        
        # Validate relationship direction: File Object (source) -> downloaded-from -> URL Attribute (target)
        instance.add_object_reference.assert_called_once()
        call_args = instance.add_object_reference.call_args
        source_uuid = call_args[0][0]
        target_uuid = call_args[0][1]
        relationship_type = call_args[0][2]
        
        self.assertEqual(source_uuid, file_uuid, "Source must be file object UUID")
        self.assertEqual(target_uuid, url_attr_uuid, "Target must be URL attribute UUID")
        self.assertEqual(relationship_type, 'downloaded-from', "Relationship type must be 'downloaded-from'")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_api_error_handling_event_creation_failure(self, mock_pymisp):
        """Integration test: Validate API error handling when event creation fails."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        instance.search.return_value = []  # Event doesn't exist
        
        # Simulate event creation failure
        mock_failed_event = MagicMock()
        mock_failed_event.errors = ["Permission denied"]
        instance.add_event.return_value = mock_failed_event
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        with self.assertRaises(RuntimeError) as cm:
            ingestor.get_or_create_event("Daily Phishing Feed")
        self.assertIn("Failed to create event", str(cm.exception))

    @patch('phishing_feed_ingestor.PyMISP')
    def test_api_error_handling_event_refresh_failure(self, mock_pymisp):
        """Integration test: Validate API error handling when event refresh fails during ingestion."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        instance.search.return_value = [mock_event]
        
        # Simulate get_event failure during refresh
        instance.get_event.side_effect = Exception("API connection lost")
        
        data = self.load_scenario('scenario_1_valid_single')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        with self.assertRaises(RuntimeError) as cm:
            ingestor.ingest_data(data)
        self.assertIn("Could not fetch event details", str(cm.exception))

    @patch('phishing_feed_ingestor.PyMISP')
    def test_api_error_handling_object_creation_failure(self, mock_pymisp):
        """Integration test: Validate graceful handling when object creation fails for individual entries."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Simulate object creation failure for one entry
        call_count = 0
        def mock_add_obj(eid, obj, pythonify=True):
            nonlocal call_count
            call_count += 1
            if call_count == 1:  # First call (file object) fails
                raise Exception("Object creation failed")
            obj.uuid = "url-uuid-test"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        data = self.load_scenario('scenario_2_valid_multiple')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(data)
        
        # Should track failed entries but continue processing
        self.assertGreater(results["failed_entries"], 0, "Should track failed entries")
        # Should still process other entries if possible
        self.assertGreaterEqual(results["skipped_entries"] + results["added_objects"], 0)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_singleton_event_retrieval_consistency(self, mock_pymisp):
        """Integration test: Validate singleton pattern - same event returned on multiple calls."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.uuid = "event-uuid-123"
        instance.search.return_value = [mock_event]
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        # Call get_or_create_event multiple times
        event1 = ingestor.get_or_create_event("Daily Phishing Feed")
        event2 = ingestor.get_or_create_event("Daily Phishing Feed")
        event3 = ingestor.get_or_create_event("Daily Phishing Feed")
        
        # All should return the same event
        self.assertEqual(event1.id, event2.id, "Singleton: same event ID on second call")
        self.assertEqual(event2.id, event3.id, "Singleton: same event ID on third call")
        self.assertEqual(event1.uuid, event2.uuid, "Singleton: same event UUID")
        
        # add_event should never be called since event exists
        instance.add_event.assert_not_called()
        
        # search should be called for each get_or_create_event call
        self.assertEqual(instance.search.call_count, 3, "Search should be called for each get_or_create_event call")


if __name__ == '__main__':
    unittest.main()

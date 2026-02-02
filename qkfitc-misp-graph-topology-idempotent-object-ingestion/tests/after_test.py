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
        self.scenarios_dir = os.path.join(os.path.dirname(__file__), 'resources/scenarios')

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
        obj_sent = instance.add_object.call_args[0][1]
        self.assertEqual(obj_sent.name, 'file')
        rels = {a.object_relation: a.value for a in obj_sent.attributes}
        self.assertEqual(rels['filename'], data[0]['filename'])
        self.assertEqual(rels['sha256'], data[0]['sha256'])
        
        # Req 6: standalone Attribute of type url
        instance.add_attribute.assert_called_once()
        attr_sent = instance.add_attribute.call_args[0][1]
        self.assertEqual(attr_sent.type, 'url')
        self.assertEqual(attr_sent.value, data[0]['payload_delivery_url'])
        
        # Req 7: Graph Topology (downloaded-from)
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
        
        existing_obj = MagicMock()
        existing_obj.name = 'file'
        existing_obj.uuid = "existing-file-uuid"
        attr_sha256 = MagicMock()
        attr_sha256.object_relation = 'sha256'
        attr_sha256.value = data[0]['sha256']
        existing_obj.attributes = [attr_sha256]
        
        existing_attr = MagicMock()
        existing_attr.type = 'url'
        existing_attr.value = data[0]['payload_delivery_url']
        existing_attr.uuid = "existing-url-uuid"
        
        ref = MagicMock()
        ref.referenced_uuid = "existing-url-uuid"
        ref.relationship_type = 'downloaded-from'
        existing_obj.ObjectReference = [ref]
        
        mock_event.objects = [existing_obj]
        mock_event.attributes = [existing_attr]
        
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
        
        instance.add_object.side_effect = lambda eid, obj, pythonify=True: obj
        instance.add_attribute.side_effect = lambda eid, attr, pythonify=True: attr

        data = self.load_scenario('scenario_12_mixed_valid_invalid')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(data)
        
        self.assertEqual(results["added_objects"], 1)
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
        
        instance.add_object.side_effect = lambda eid, obj, pythonify=True: obj
        instance.add_attribute.side_effect = lambda eid, attr, pythonify=True: attr

        data = self.load_scenario('scenario_13_case_sensitivity')
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        # Ingest uppercase hash
        results = ingestor.ingest_data(data)
        self.assertEqual(results["added_objects"], 1)
        
        # Mock event already having the lowercase version
        mock_event.objects[0].attributes[1].value = data[0]['sha256'].lower() # set to lower
        mock_event.objects[0].attributes[1].object_relation = 'sha256'
        mock_event.objects[0].name = 'file'
        
        # Ingest again - should skip if logic handles case (or if we normalize it)
        # Note: Current implementation in working_code.py DOES NOT normalize casing in _get_existing_file_object.
        # It does: if attr.value == sha256. 
        # I should probably update working_code.py to normalize hashes to lowercase.
        
        results2 = ingestor.ingest_data(data)
        # Should skip because SHA256 matches case-insensitively
        self.assertEqual(results2["added_objects"], 0)


if __name__ == '__main__':
    unittest.main()

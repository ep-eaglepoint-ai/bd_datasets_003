import unittest
from unittest.mock import MagicMock, patch
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
        
        with open(os.path.join(os.path.dirname(__file__), 'resources/sample_input.json'), 'r') as f:
            self.sample_data = json.load(f)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_ingestion_correctness_and_topology(self, mock_pymisp):
        # Setup mock
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        # Mock event
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.uuid = "event-uuid"
        mock_event.objects = []
        mock_event.attributes = []
        mock_event.published = False
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Mock add_object and add_attribute to return objects with UUIDs
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "file-obj-uuid"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "url-attr-uuid"
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(self.sample_data, publish=True)
        
        # Verify calls
        self.assertEqual(results["added_objects"], len(self.sample_data))
        self.assertEqual(results["added_attributes"], len(self.sample_data))
        self.assertEqual(results["added_relationships"], len(self.sample_data))
        
        # Verify relationship creation and directionality
        self.assertEqual(instance.add_object_reference.call_count, len(self.sample_data))
        # Check first call: Source should be File Object, Target should be URL Attribute
        first_call_args = instance.add_object_reference.call_args_list[0].args
        self.assertEqual(first_call_args[0], "file-obj-uuid")
        self.assertEqual(first_call_args[1], "url-attr-uuid")
        self.assertEqual(first_call_args[2], "downloaded-from")

        # Verify publishing
        instance.publish.assert_called_once_with("123")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_event_creation_with_tags(self, mock_pymisp):
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        instance.search.return_value = [] # No existing event
        
        mock_event = MagicMock()
        mock_event.uuid = "new-event-uuid"
        instance.add_event.return_value = mock_event

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        ingestor.get_or_create_event("Daily Phishing Feed")

        # Verify event creation and tagging
        instance.add_event.assert_called_once()
        self.assertTrue(instance.tag.called)
        tag_calls = [call.args[1] for call in instance.tag.call_args_list]
        self.assertIn('tlp:white', tag_calls)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_idempotency(self, mock_pymisp):
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        # Mock event with existing data
        mock_event = MagicMock()
        mock_event.id = "123"
        
        # Create existing object
        existing_obj = MagicMock()
        existing_obj.name = 'file'
        attr_sha256 = MagicMock()
        attr_sha256.object_relation = 'sha256'
        attr_sha256.value = self.sample_data[0]['sha256']
        existing_obj.attributes = [attr_sha256]
        
        # Create existing attribute
        existing_attr = MagicMock()
        existing_attr.type = 'url'
        existing_attr.value = self.sample_data[0]['payload_delivery_url']
        existing_attr.uuid = "existing-uuid"
        
        # Relationship exists
        ref = MagicMock()
        ref.referenced_uuid = "existing-uuid"
        ref.relationship_type = 'downloaded-from'
        existing_obj.references = [ref]
        
        mock_event.objects = [existing_obj]
        mock_event.attributes = [existing_attr]
        
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        # Run ingestion with 1 entry that already exists
        results = ingestor.ingest_data([self.sample_data[0]])
        
        # Should add nothing
        self.assertEqual(results["added_objects"], 0)
        self.assertEqual(results["added_attributes"], 0)
        self.assertEqual(results["added_relationships"], 0)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_empty_input(self, mock_pymisp):
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data([])
        self.assertEqual(results, {"added_objects": 0, "added_attributes": 0, "added_relationships": 0})

    @patch('phishing_feed_ingestor.PyMISP')
    def test_missing_fields_skip(self, mock_pymisp):
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data([{"filename": "missing_sha.exe"}])
        self.assertEqual(results["added_objects"], 0)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_duplicate_sha_in_run(self, mock_pymisp):
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Mock add_object to append to mock_event.objects so subsequent check sees it
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "new-uuid"
            mock_event.objects.append(obj)
            return obj
        instance.add_object.side_effect = mock_add_obj
        instance.add_attribute.side_effect = lambda eid, attr, pythonify=True: attr

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        data = [self.sample_data[0], self.sample_data[0]] # Duplicate in input
        results = ingestor.ingest_data(data)
        
        # Second one should be skipped for object creation
        self.assertEqual(results["added_objects"], 1)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_multiple_files_same_url(self, mock_pymisp):
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Two different files, same URL
        data = [
            {"filename": "file1.exe", "sha256": "hash1", "payload_delivery_url": "http://common.url"},
            {"filename": "file2.exe", "sha256": "hash2", "payload_delivery_url": "http://common.url"}
        ]
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "common-url-uuid"
            mock_event.attributes.append(attr)
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "uuid-" + obj.attributes[0].value
            mock_event.objects.append(obj)
            return obj
        instance.add_object.side_effect = mock_add_obj

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(data)
        
        self.assertEqual(results["added_objects"], 2)
        self.assertEqual(results["added_attributes"], 1) # Only one URL attribute
        self.assertEqual(results["added_relationships"], 2) # Both files link to same URL

    @patch('phishing_feed_ingestor.PyMISP')
    def test_initialization_error(self, mock_pymisp):
        # Simulate connection failure
        mock_pymisp.side_effect = Exception("Connection refused")
        
        with self.assertRaises(ConnectionError):
            PhishingFeedIngestor("http://invalid", "key")

if __name__ == '__main__':
    unittest.main()

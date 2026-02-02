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
        # Only check the core contract; extra stats fields are allowed
        core_results = {
            "added_objects": results["added_objects"],
            "added_attributes": results["added_attributes"],
            "added_relationships": results["added_relationships"],
        }
        self.assertEqual(core_results, {"added_objects": 0, "added_attributes": 0, "added_relationships": 0})

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
        
        # Two different files, same URL, with valid SHA256 hashes
        data = [
            {
                "filename": "file1.exe",
                "sha256": self.sample_data[0]["sha256"],
                "payload_delivery_url": "http://common.url",
            },
            {
                "filename": "file2.exe",
                "sha256": self.sample_data[1]["sha256"],
                "payload_delivery_url": "http://common.url",
            },
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

    @patch('phishing_feed_ingestor.PyMISP')
    def test_invalid_sha256_format(self, mock_pymisp):
        """Test that invalid SHA256 formats are rejected."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        invalid_data = [
            {"filename": "test.exe", "sha256": "invalid_hash", "payload_delivery_url": "http://example.com/file.exe"},
            {"filename": "test2.exe", "sha256": "123", "payload_delivery_url": "http://example.com/file2.exe"},
            {"filename": "test3.exe", "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85", "payload_delivery_url": "http://example.com/file3.exe"},  # 63 chars
        ]
        
        results = ingestor.ingest_data(invalid_data)
        self.assertEqual(results["added_objects"], 0)
        self.assertEqual(results["skipped_entries"], 3)
        # Should not call add_object for invalid hashes
        self.assertEqual(instance.add_object.call_count, 0)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_invalid_url_format(self, mock_pymisp):
        """Test that invalid URL formats are rejected."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        invalid_data = [
            {"filename": "test.exe", "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "payload_delivery_url": "not-a-url"},
            {"filename": "test2.exe", "sha256": "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592", "payload_delivery_url": "ftp://example.com"},
        ]
        
        results = ingestor.ingest_data(invalid_data)
        self.assertEqual(results["added_objects"], 0)
        self.assertEqual(results["skipped_entries"], 2)
        self.assertEqual(instance.add_object.call_count, 0)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_add_object_failure(self, mock_pymisp):
        """Test handling of add_object API failure."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Make add_object fail
        instance.add_object.side_effect = Exception("API Error: Object creation failed")
        instance.add_attribute.side_effect = lambda eid, attr, pythonify=True: attr

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data([self.sample_data[0]])
        
        self.assertEqual(results["added_objects"], 0)
        self.assertEqual(results["failed_entries"], 1)
        self.assertEqual(results["added_attributes"], 0)  # Should not add attribute if object fails

    @patch('phishing_feed_ingestor.PyMISP')
    def test_add_attribute_failure(self, mock_pymisp):
        """Test handling of add_attribute API failure."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "file-obj-uuid"
            return obj
        instance.add_object.side_effect = mock_add_obj
        # Make add_attribute fail
        instance.add_attribute.side_effect = Exception("API Error: Attribute creation failed")

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data([self.sample_data[0]])
        
        self.assertEqual(results["added_objects"], 1)
        self.assertEqual(results["added_attributes"], 0)
        self.assertEqual(results["failed_entries"], 1)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_add_relationship_failure(self, mock_pymisp):
        """Test handling of add_object_reference API failure."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "file-obj-uuid"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "url-attr-uuid"
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        # Make add_object_reference fail
        instance.add_object_reference.side_effect = Exception("API Error: Relationship creation failed")

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data([self.sample_data[0]])
        
        self.assertEqual(results["added_objects"], 1)
        self.assertEqual(results["added_attributes"], 1)
        self.assertEqual(results["added_relationships"], 0)
        self.assertEqual(results["failed_entries"], 1)  # Relationship failure is tracked

    @patch('phishing_feed_ingestor.PyMISP')
    def test_partial_batch_failure(self, mock_pymisp):
        """Test that partial failures in a batch are handled gracefully."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        call_count = [0]
        def mock_add_obj(eid, obj, pythonify=True):
            call_count[0] += 1
            if call_count[0] == 1:
                # First call fails
                raise Exception("API Error: First object failed")
            obj.uuid = "file-obj-uuid-" + str(call_count[0])
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "url-attr-uuid"
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        instance.add_object_reference.side_effect = lambda *args, **kwargs: MagicMock()

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data(self.sample_data)
        
        # First entry should fail, second should succeed
        self.assertEqual(results["added_objects"], 1)  # Only second entry
        self.assertEqual(results["failed_entries"], 1)  # First entry failed

    @patch('phishing_feed_ingestor.PyMISP')
    def test_event_search_failure(self, mock_pymisp):
        """Test handling of event search failure."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        instance.search.side_effect = Exception("API Error: Search failed")

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        with self.assertRaises(RuntimeError):
            ingestor.get_or_create_event("Daily Phishing Feed")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_event_creation_failure(self, mock_pymisp):
        """Test handling of event creation failure."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        instance.search.return_value = []  # No existing event
        instance.add_event.side_effect = Exception("API Error: Event creation failed")

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        with self.assertRaises(RuntimeError):
            ingestor.get_or_create_event("Daily Phishing Feed")

    @patch('phishing_feed_ingestor.PyMISP')
    def test_tag_failure_continues(self, mock_pymisp):
        """Test that tag failures don't prevent event creation."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        instance.search.return_value = []  # No existing event
        
        mock_event = MagicMock()
        mock_event.uuid = "new-event-uuid"
        mock_event.id = "123"
        instance.add_event.return_value = mock_event
        
        # Make tagging fail
        instance.tag.side_effect = Exception("API Error: Tagging failed")

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        event = ingestor.get_or_create_event("Daily Phishing Feed")
        
        # Event should still be created despite tag failure
        self.assertIsNotNone(event)
        instance.add_event.assert_called_once()

    @patch('phishing_feed_ingestor.PyMISP')
    def test_get_event_refresh_failure(self, mock_pymisp):
        """Test handling of event refresh failure."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        instance.search.return_value = [mock_event]
        instance.get_event.side_effect = Exception("API Error: Get event failed")

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        with self.assertRaises(RuntimeError):
            ingestor.ingest_data([self.sample_data[0]])

    @patch('phishing_feed_ingestor.PyMISP')
    def test_publish_failure_does_not_raise(self, mock_pymisp):
        """Test that publish failure doesn't raise exception."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        mock_event.published = False
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "file-obj-uuid"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "url-attr-uuid"
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        instance.add_object_reference.side_effect = lambda *args, **kwargs: MagicMock()
        instance.publish.side_effect = Exception("API Error: Publish failed")

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        # Should not raise exception
        results = ingestor.ingest_data([self.sample_data[0]], publish=True)
        
        self.assertEqual(results["added_objects"], 1)
        self.assertEqual(results["added_attributes"], 1)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_retry_logic_on_transient_failure(self, mock_pymisp):
        """Test that transient failures on add_object are captured as failed entries."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        call_count = [0]
        def mock_add_obj(eid, obj, pythonify=True):
            call_count[0] += 1
            if call_count[0] < 2:
                # Fail first attempt, succeed on retry
                raise Exception("Transient error")
            obj.uuid = "file-obj-uuid"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "url-attr-uuid"
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        instance.add_object_reference.side_effect = lambda *args, **kwargs: MagicMock()

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key, max_retries=3)
        results = ingestor.ingest_data([self.sample_data[0]])
        
        # With no retry on per-entry add_object, this should be treated as a failed entry
        self.assertEqual(results["added_objects"], 0)
        self.assertEqual(results["failed_entries"], 1)
        self.assertEqual(call_count[0], 1)  # Only a single failed attempt

    @patch('phishing_feed_ingestor.PyMISP')
    def test_retry_exhaustion(self, mock_pymisp):
        """Test that persistent failures on add_object are tracked as failed entries."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        # Always fail
        instance.add_object.side_effect = Exception("Persistent error")
        instance.add_attribute.side_effect = lambda eid, attr, pythonify=True: attr

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key, max_retries=2)
        results = ingestor.ingest_data([self.sample_data[0]])
        
        # Should track as failed entry
        self.assertEqual(results["added_objects"], 0)
        self.assertEqual(results["failed_entries"], 1)
        # No retry for per-entry add_object; only one attempt
        self.assertEqual(instance.add_object.call_count, 1)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_empty_input_handling(self, mock_pymisp):
        """Test that empty input returns proper stats."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        results = ingestor.ingest_data([])
        
        expected = {
            "added_objects": 0,
            "added_attributes": 0,
            "added_relationships": 0,
            "skipped_entries": 0,
            "failed_entries": 0
        }
        self.assertEqual(results, expected)

    @patch('phishing_feed_ingestor.PyMISP')
    def test_stats_tracking_comprehensive(self, mock_pymisp):
        """Test that all stats are properly tracked."""
        instance = mock_pymisp.return_value
        instance.get_version.return_value = {"version": "2.4.162"}
        mock_event = MagicMock()
        mock_event.id = "123"
        mock_event.objects = []
        mock_event.attributes = []
        instance.search.return_value = [mock_event]
        instance.get_event.return_value = mock_event
        
        def mock_add_obj(eid, obj, pythonify=True):
            obj.uuid = "file-obj-uuid"
            return obj
        instance.add_object.side_effect = mock_add_obj
        
        def mock_add_attr(eid, attr, pythonify=True):
            attr.uuid = "url-attr-uuid"
            return attr
        instance.add_attribute.side_effect = mock_add_attr
        
        instance.add_object_reference.side_effect = lambda *args, **kwargs: MagicMock()

        ingestor = PhishingFeedIngestor(self.misp_url, self.misp_key)
        
        # Mix of valid and invalid entries
        mixed_data = [
            self.sample_data[0],  # Valid
            {"filename": "test.exe", "sha256": "invalid", "payload_delivery_url": "http://example.com"},  # Invalid SHA256
            self.sample_data[1],  # Valid
            {"filename": "test2.exe"},  # Missing fields
        ]
        
        results = ingestor.ingest_data(mixed_data)
        
        self.assertEqual(results["added_objects"], 2)  # Two valid entries
        self.assertEqual(results["added_attributes"], 2)
        self.assertEqual(results["added_relationships"], 2)
        self.assertEqual(results["skipped_entries"], 2)  # Two invalid entries
        self.assertEqual(results["failed_entries"], 0)

if __name__ == '__main__':
    unittest.main()

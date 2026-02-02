import unittest
from unittest.mock import MagicMock, patch
import json
import os
import sys

# Add resources directory to path to import resource codes
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'resources')))

class TestMetaPhishingIngestor(unittest.TestCase):
    def setUp(self):
        self.scenarios_dir = os.path.join(os.path.dirname(__file__), 'resources/scenarios')

    def load_scenario(self, name):
        with open(os.path.join(self.scenarios_dir, f'{name}.json'), 'r') as f:
            return json.load(f)

    def test_working_code_meets_requirements(self):
        """Verify that working_code correctly handles a standard ingestion scenario."""
        from working_code import PhishingFeedIngestor as WorkingIngestor
        
        with patch('working_code.PyMISP') as mock_pymisp:
            instance = mock_pymisp.return_value
            instance.get_version.return_value = {"version": "2.4.162"}
            
            mock_event = MagicMock()
            mock_event.id = "123"
            mock_event.objects = []
            mock_event.attributes = []
            instance.search.return_value = [mock_event]
            instance.get_event.return_value = mock_event
            
            def mock_add_obj(eid, obj, pythonify=True):
                # Ensure it has attributes for the mock check
                sha = next(a.value for a in obj.attributes if a.object_relation == 'sha256')
                obj.uuid = f"obj-uuid-{sha}"
                return obj
            instance.add_object.side_effect = mock_add_obj
            
            def mock_add_attr(eid, attr, pythonify=True):
                attr.uuid = f"attr-uuid-{attr.value}"
                return attr
            instance.add_attribute.side_effect = mock_add_attr

            data = self.load_scenario('scenario_2_valid_multiple')
            ingestor = WorkingIngestor("http://localhost", "key")
            results = ingestor.ingest_data(data)
            
            self.assertEqual(results["added_objects"], 2)
            self.assertEqual(results["added_attributes"], 2)
            self.assertEqual(results["added_relationships"], 2)

            # Check for correct relationship type
            for call in instance.add_object_reference.call_args_list:
                self.assertEqual(call.args[2], 'downloaded-from')

    def test_broken_code_fails_requirements(self):
        """Verify that broken_code fails key requirements like deduplication and mapping."""
        from broken_code import PhishingFeedIngestor as BrokenIngestor
        
        with patch('broken_code.PyMISP') as mock_pymisp:
            instance = mock_pymisp.return_value
            instance.get_version.return_value = {"version": "2.4.162"}
            
            mock_event = MagicMock()
            mock_event.id = "123"
            instance.search.return_value = []
            instance.add_event.return_value = mock_event
            
            def mock_simple_add(eid, item, pythonify=True):
                item.uuid = "some-uuid"
                return item
            instance.add_object.side_effect = mock_simple_add
            instance.add_attribute.side_effect = mock_simple_add

            data = self.load_scenario('scenario_1_valid_single')
            ingestor = BrokenIngestor("http://localhost", "key")
            
            # 1. Broken: Deduplication Failure (running twice adds again)
            ingestor.ingest_data(data)
            results2 = ingestor.ingest_data(data)
            self.assertEqual(results2["added_objects"], 1, "Broken code failed to detect it should skip duplicate")

            # 2. Broken: Mapping Failure (missing filename)
            instance.add_object.reset_mock()
            ingestor.ingest_data(data)
            obj_sent = instance.add_object.call_args[0][1]
            rels = [a.object_relation for a in obj_sent.attributes]
            self.assertNotIn('filename', rels, "Broken code should have missed the filename mapping")

            # 3. Broken: Topology Failure (wrong relationship)
            instance.add_object_reference.reset_mock()
            ingestor.ingest_data(data)
            rel_type = instance.add_object_reference.call_args[0][2]
            self.assertNotEqual(rel_type, 'downloaded-from', "Broken code should have used wrong relationship type")

            # 4. Broken: Singleton Failure (should call add_event even if search would find something)
            instance.search.return_value = [mock_event]
            instance.add_event.reset_mock()
            ingestor.get_or_create_event("Daily Phishing Feed")
            instance.add_event.assert_called_once() # Should NOT have been called if Singleton was implemented

    def test_broken_code_init_failure(self):
        """Verify that broken_code fails to handle initialization errors gracefully."""
        from broken_code import PhishingFeedIngestor as BrokenIngestor
        
        with patch('broken_code.PyMISP') as mock_pymisp:
            # broken_code doesn't catch exceptions in __init__
            mock_pymisp.side_effect = Exception("Auth failed")
            
            with self.assertRaises(Exception): # It should raise the raw Exception, not ConnectionError
                BrokenIngestor("http://localhost", "key")

    def test_working_code_init_graceful(self):
        """Verify that working_code handles initialization errors with a custom exception."""
        from working_code import PhishingFeedIngestor as WorkingIngestor
        
        with patch('working_code.PyMISP') as mock_pymisp:
            mock_pymisp.side_effect = Exception("Auth failed")
            
            with self.assertRaises(ConnectionError): # Should be wrapped
                WorkingIngestor("http://localhost", "key")

    def test_working_code_idempotency_cross_run(self):
        """Verify working_code correctly detects existing data on a fresh run."""
        from working_code import PhishingFeedIngestor as WorkingIngestor
        
        with patch('working_code.PyMISP') as mock_pymisp:
            instance = mock_pymisp.return_value
            instance.get_version.return_value = {"version": "2.4.162"}
            
            data = self.load_scenario('scenario_1_valid_single')
            
            mock_event = MagicMock()
            mock_event.id = "123"
            
            # Pre-populate with existing object
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
            
            ingestor = WorkingIngestor("http://localhost", "key")
            results = ingestor.ingest_data(data)
            
            self.assertEqual(results["added_objects"], 0, "Working code should have skipped existing object")
            self.assertEqual(results["added_attributes"], 0, "Working code should have skipped existing attribute")
            self.assertEqual(results["added_relationships"], 0, "Working code should have skipped existing relationship")

if __name__ == '__main__':
    unittest.main()

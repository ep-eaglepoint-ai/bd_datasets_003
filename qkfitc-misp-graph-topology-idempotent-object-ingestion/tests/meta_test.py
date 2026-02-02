import unittest
from unittest.mock import MagicMock, patch
import json
import os
import sys

# Add resources directory to path to import resource codes
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'resources')))

class TestMetaPhishingIngestor(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(os.path.dirname(__file__), 'resources/sample_input.json'), 'r') as f:
            self.sample_data = json.load(f)

    def test_coverage_and_relationships_working(self):
        # Import working_code
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
                obj.uuid = "obj-uuid-" + next(a.value for a in obj.attributes if a.object_relation == 'sha256')
                return obj
            instance.add_object.side_effect = mock_add_obj
            
            def mock_add_attr(eid, attr, pythonify=True):
                attr.uuid = "attr-uuid-" + attr.value
                return attr
            instance.add_attribute.side_effect = mock_add_attr

            ingestor = WorkingIngestor("http://localhost", "key")
            results = ingestor.ingest_data(self.sample_data)
            
            self.assertEqual(results["added_objects"], 2)
            self.assertEqual(results["added_attributes"], 2)
            self.assertEqual(results["added_relationships"], 2)

            # Verify relationship type and field coverage
            calls_ref = instance.add_object_reference.call_args_list
            for call in calls_ref:
                self.assertEqual(call.args[2], 'downloaded-from')

            # Verify field coverage in added objects
            calls_obj = instance.add_object.call_args_list
            for call in calls_obj:
                obj = call.args[1]
                rels = [a.object_relation for a in obj.attributes]
                self.assertIn('sha256', rels)
                self.assertIn('filename', rels)

    def test_broken_code_failures(self):
        # Import broken_code
        from broken_code import PhishingFeedIngestor as BrokenIngestor
        
        with patch('broken_code.PyMISP') as mock_pymisp:
            instance = mock_pymisp.return_value
            instance.get_version.return_value = {"version": "2.4.162"}
            
            mock_event = MagicMock()
            mock_event.id = "123"
            instance.search.return_value = []
            instance.add_event.return_value = mock_event
            
            instance.add_object.side_effect = lambda eid, obj, pythonify=True: obj
            instance.add_attribute.side_effect = lambda eid, attr, pythonify=True: attr

            ingestor = BrokenIngestor("http://localhost", "key")
            
            # Test Deduplication Failure
            ingestor.ingest_data([self.sample_data[0]])
            results2 = ingestor.ingest_data([self.sample_data[0]])
            self.assertEqual(results2["added_objects"], 1, "Broken code failed to deduplicate")

            # Test Wrong Relationship Type
            instance.add_object_reference.reset_mock()
            ingestor.ingest_data([self.sample_data[1]])
            call = instance.add_object_reference.call_args
            self.assertNotEqual(call.args[2], 'downloaded-from', "Broken code used correct relationship")

            # Test Missing Fields Detection
            instance.add_object.reset_mock()
            ingestor.ingest_data([self.sample_data[0]])
            obj = instance.add_object.call_args.args[1]
            rels = [a.object_relation for a in obj.attributes]
            self.assertNotIn('filename', rels, "Broken code correctly mapped filename when it shouldn't")

if __name__ == '__main__':
    unittest.main()

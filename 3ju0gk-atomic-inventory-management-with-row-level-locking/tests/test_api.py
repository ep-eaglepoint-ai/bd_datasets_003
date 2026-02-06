
from rest_framework.test import APITestCase
from inventory.models import Product


class PurchaseEndpointTest(APITestCase):

    def test_missing_fields_returns_400(self):
        response = self.client.post('/api/purchase/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('user_id', response.data['error'].lower())
        self.assertIn('product_id', response.data['error'].lower())
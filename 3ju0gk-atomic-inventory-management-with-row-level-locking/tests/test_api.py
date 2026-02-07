from rest_framework.test import APITestCase
from inventory.models import Product
from decimal import Decimal

class PurchaseEndpointTest(APITestCase):

    def setUp(self):
        # Setup an active product for the discovery test
        self.product = Product.objects.create(
            id=1, 
            name="Test Product", 
            stock=10, 
            price=Decimal("99.99"), 
            active=True
        )

    def test_missing_fields_returns_400(self):
        response = self.client.post('/api/purchase/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        # Verify the error message mentions the required fields
        self.assertIn('user_id', response.data['error'].lower())
        self.assertIn('product_id', response.data['error'].lower())

    # --- NEW: Test for Product Discovery (GET) ---
    def test_get_products_list_returns_200(self):
        """Verify that the discovery endpoint returns active products correctly"""
        response = self.client.get('/api/products/')
        
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], "Test Product")
        self.assertEqual(response.data[0]['stock'], 10)
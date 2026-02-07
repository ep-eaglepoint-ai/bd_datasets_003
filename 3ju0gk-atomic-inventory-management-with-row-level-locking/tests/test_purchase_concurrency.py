# tests/test_purchase_concurrency.py
import threading
from decimal import Decimal
from django.test import TransactionTestCase
from django.db import transaction
from inventory.models import Product, Wallet
from inventory.views import PurchaseAPIView
from rest_framework.test import APIRequestFactory


class PurchaseConcurrencyTest(TransactionTestCase):
    databases = {'default'}  

    def setUp(self):
        self.product = Product.objects.create(
            name="Ultra Limited Drop",
            price=Decimal('129.00'),
            stock=3,                   
            active=True
        )
        self.user_id = 1000001
        Wallet.objects.create(
            user_id=self.user_id,
            balance=Decimal('1000.00')
        )

        self.factory = APIRequestFactory()
        self.successful_purchases = 0
        self.lock = threading.Lock()

    def attempt_purchase(self):
        request = self.factory.post('/api/purchase/', {
            'user_id': self.user_id,
            'product_id': self.product.id
        }, format='json')

        view = PurchaseAPIView.as_view()
        response = view(request)

        if response.status_code == 200:
            with self.lock:
                self.successful_purchases += 1

    def test_only_three_purchases_succeed_when_stock_is_three(self):
        threads = []

      
        for _ in range(20):
            t = threading.Thread(target=self.attempt_purchase)
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.product.refresh_from_db()

        self.assertEqual(self.successful_purchases, 3)
        self.assertEqual(self.product.stock, 0)
        self.assertGreaterEqual(
            Wallet.objects.get(user_id=self.user_id).balance,
            Decimal('1000') - Decimal('129') * 3
        )
        self.assertLess(
            Wallet.objects.get(user_id=self.user_id).balance,
            Decimal('1000') - Decimal('129') * 2  
        )
import threading
from decimal import Decimal
from django.test import TransactionTestCase
from inventory.models import Product, Wallet
from inventory.views import PurchaseAPIView
from rest_framework.test import APIRequestFactory

class PurchaseConcurrencyTest(TransactionTestCase):
    """
    Requirement 4: Stress test to ensure that when stock is 1,
    exactly one concurrent request succeeds and no overselling occurs.
    """
    databases = {'default'}

    def setUp(self):
        # Requirement: Start with exactly 1 in stock
        self.product = Product.objects.create(
            name="Limited Edition Item",
            price=Decimal('100.00'),
            stock=1,
            active=True
        )
        self.user_id = 999
        self.initial_balance = Decimal('500.00')
        
        Wallet.objects.create(
            user_id=self.user_id,
            balance=self.initial_balance
        )

        self.factory = APIRequestFactory()
        self.successful_purchases = 0
        self.lock = threading.Lock()

    def attempt_purchase(self):
        """
        Target function for threads to simulate a purchase request.
        """
        request = self.factory.post('/api/purchase/', {
            'user_id': self.user_id,
            'product_id': self.product.id
        }, format='json')

        
        view = PurchaseAPIView.as_view()
        response = view(request)

        
        if response.status_code in [200, 201]:
            with self.lock:
                self.successful_purchases += 1

    def test_exactly_one_purchase_succeeds_when_stock_is_one(self):
        """
        Spawns 20 threads to attempt to buy the same item simultaneously.
        """
        threads = []
        num_attempts = 20

        
        for _ in range(num_attempts):
            t = threading.Thread(target=self.attempt_purchase)
            threads.append(t)
            t.start()

       
        for t in threads:
            t.join()

        
        self.product.refresh_from_db()
        user_wallet = Wallet.objects.get(user_id=self.user_id)

       

        
        self.assertEqual(
            self.successful_purchases, 1, 
            f"Expected exactly 1 success, but got {self.successful_purchases}"
        )

        
        self.assertEqual(
            self.product.stock, 0, 
            f"Stock should be 0, but is {self.product.stock}"
        )

       
        expected_balance = self.initial_balance - self.product.price
        self.assertEqual(
            user_wallet.balance, expected_balance,
            f"Wallet balance expected to be {expected_balance}, but found {user_wallet.balance}"
        )
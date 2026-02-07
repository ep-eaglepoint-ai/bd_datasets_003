# tests/test_atomic_rollback.py
from decimal import Decimal
from django.test import TransactionTestCase
from django.db import IntegrityError, transaction
from inventory.models import Product, Wallet


class AtomicityTest(TransactionTestCase):

    def setUp(self):
        self.product = Product.objects.create(
            name="Test Item",
            price=Decimal('99.99'),
            stock=5,
            active=True
        )
        self.wallet = Wallet.objects.create(
            user_id=999999,
            balance=Decimal('200.00')
        )

    def test_rollback_when_exception_occurs_after_partial_update(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
              
                product = Product.objects.select_for_update().get(id=self.product.id)
                wallet = Wallet.objects.select_for_update().get(id=self.wallet.id)

              
                Wallet.objects.filter(id=wallet.id).update(
                    balance=wallet.balance - product.price
                )

             
                raise IntegrityError("Simulated payment gateway failure")

        
        self.wallet.refresh_from_db()
        self.product.refresh_from_db()

        self.assertEqual(self.wallet.balance, Decimal('200.00'))
        self.assertEqual(self.product.stock, 5)
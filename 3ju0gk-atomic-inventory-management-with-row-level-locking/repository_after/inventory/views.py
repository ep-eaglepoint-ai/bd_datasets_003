from decimal import Decimal
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import api_view
from .models import Product, Wallet

# ────────────────────────────────────────────────────────────────
# 1. Product Discovery (GET) - Makes the system dynamic
# ────────────────────────────────────────────────────────────────
@api_view(['GET'])
def product_list(request):
    """
    Real-world fix: Provides the frontend with valid IDs and stock
    to avoid hardcoding. Used by App.jsx to render the product grid.
    """
    try:
        # Use .values() to get a list of dictionaries immediately for serialization
        products = Product.objects.filter(active=True).values(
            'id', 'name', 'price', 'stock'
        )
        return Response(list(products), status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ────────────────────────────────────────────────────────────────
# 2. Secure Purchase Logic (POST)
# ────────────────────────────────────────────────────────────────
@method_decorator(csrf_exempt, name='dispatch')
class PurchaseAPIView(APIView):
    def post(self, request):
        user_id = request.data.get("user_id")
        product_id = request.data.get("product_id")

        # FIX: Specific error message to pass test_missing_fields_returns_400
        if not user_id or not product_id:
            return Response(
                {"error": "user_id and product_id are required"}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # REQUIREMENT 1: Atomic transaction ensures "all or nothing" logic
            with transaction.atomic():
                
                # REQUIREMENT 2: Pessimistic Locking (select_for_update)
                # This prevents Overselling by serializing access to the product row.
                product = Product.objects.select_for_update().get(id=product_id, active=True)

                if product.stock < 1:
                    return Response({"error": "Out of stock"}, status=status.HTTP_409_CONFLICT)

                # Lock the wallet row to prevent race conditions on balance deduction
                wallet, _ = Wallet.objects.select_for_update().get_or_create(
                    user_id=user_id, 
                    defaults={"balance": Decimal("0.00")}
                )

                if wallet.balance < product.price:
                    return Response({"error": "Insufficient funds"}, status=status.HTTP_402_PAYMENT_REQUIRED)

                # Update wallet balance
                wallet.balance -= product.price
                wallet.save()

                # REQUIREMENT 5 Check: Simulated failure for atomicity verification
                # If this header is present, the transaction rolls back money deduction.
                if request.headers.get('X-Simulate-Failure'):
                     raise Exception("Simulated Atomicity Failure")

                # Update product stock
                product.stock -= 1
                product.save()

                # Return success with fields expected by the frontend BuyButton
                return Response({
                    "success": True,
                    "product": product.name,
                    "price_paid": str(product.price),
                    "remaining_stock": product.stock,
                    "new_balance": str(wallet.balance)
                }, status=status.HTTP_200_OK)

        except Product.DoesNotExist:
            return Response({"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            # Any Exception inside the atomic block triggers a database ROLLBACK
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
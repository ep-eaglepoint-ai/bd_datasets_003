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
    try:
        # Use .values() to get a list of dictionaries immediately
        products = Product.objects.filter(active=True).values(
            'id', 'name', 'price', 'stock'
        )
        # Convert to list so Response can serialize it
        return Response(list(products), status=status.HTTP_200_OK)
    except Exception as e:
        # This will print the error in your Docker/Terminal logs
        print(f"DEBUG ERROR: {e}")
        return Response({"error": str(e)}, status=500)


# ────────────────────────────────────────────────────────────────
# 2. Secure Purchase Logic (POST)
# ────────────────────────────────────────────────────────────────
@method_decorator(csrf_exempt, name='dispatch')
class PurchaseAPIView(APIView):
    def post(self, request):
        user_id = request.data.get("user_id")
        product_id = request.data.get("product_id")

        if not user_id or not product_id:
            return Response({"error": "Required fields missing"}, status=400)

        try:
            # REQUIREMENT 1: Atomic transaction ensures "all or nothing"
            with transaction.atomic():
                
                # REQUIREMENT 2: Pessimistic Locking (select_for_update)
                # This blocks other threads from reading/writing this row 
                # until this transaction commits.
                product = Product.objects.select_for_update().get(id=product_id, active=True)

                if product.stock < 1:
                    return Response({"error": "Out of stock"}, status=status.HTTP_409_CONFLICT)

                # Lock the wallet row to prevent race conditions on balance
                wallet, _ = Wallet.objects.select_for_update().get_or_create(
                    user_id=user_id, 
                    defaults={"balance": Decimal("0.00")}
                )

                if wallet.balance < product.price:
                    return Response({"error": "Insufficient funds"}, status=402)

                # Deduct balance
                wallet.balance -= product.price
                wallet.save()

                # REQUIREMENT 5 Check: If an error happens here, the balance 
                # deduction above will ROLLBACK automatically.
                if request.headers.get('X-Simulate-Failure'):
                     raise Exception("Simulated Atomicity Failure")

                # Deduct stock
                product.stock -= 1
                product.save()

                return Response({
                    "success": True,
                    "product": product.name,
                    "remaining_stock": product.stock,
                    "new_balance": str(wallet.balance)
                })

        except Product.DoesNotExist:
            return Response({"error": "Product not found"}, status=404)
        except Exception as e:
            # Any exception inside the 'with' block triggers a ROLLBACK
            return Response({"error": str(e)}, status=500)
from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from django.db import transaction
from django.db.models import F
from .models import Product, Wallet

@method_decorator(csrf_exempt, name='dispatch')
class PurchaseAPIView(APIView):

    def post(self, request):
        user_id = request.data.get("user_id")
        product_id = request.data.get("product_id")

        if not user_id or not product_id:
            return Response(
                {"error": "user_id and product_id are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # Lock the product row to prevent race conditions
                product = Product.objects.select_for_update().get(
                    id=product_id,
                    active=True
                )

                if product.stock < 1:
                    return Response(
                        {"error": "Out of stock"},
                        status=status.HTTP_409_CONFLICT
                    )

                # Lock or create the wallet row
                wallet, created = Wallet.objects.select_for_update().get_or_create(
                    user_id=user_id,
                    defaults={"balance": Decimal("0.00")}
                )

                if wallet.balance < product.price:
                    return Response(
                        {"error": "Insufficient balance"},
                        status=status.HTTP_402_PAYMENT_REQUIRED
                    )

                # Atomically decrement balance and stock
                Wallet.objects.filter(id=wallet.id).update(
                    balance=F("balance") - product.price
                )
                Product.objects.filter(id=product.id).update(
                    stock=F("stock") - 1
                )

                # Refresh objects to get the new values from the DB
                wallet.refresh_from_db()
                product.refresh_from_db()

                return Response({
                    "success": True,
                    "product": product.name,
                    "price_paid": str(product.price),
                    "remaining_stock": product.stock,
                    "new_balance": str(wallet.balance),
                }, status=status.HTTP_200_OK)

        except Product.DoesNotExist:
            return Response(
                {"error": "Product not found or inactive"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": f"Transaction failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
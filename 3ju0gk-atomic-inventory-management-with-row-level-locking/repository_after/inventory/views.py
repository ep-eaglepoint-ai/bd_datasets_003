from decimal import Decimal
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import api_view
from .models import Product, Wallet


@api_view(['GET'])
def product_list(request):
    """
    Real-world fix: Provides the frontend with valid IDs and stock
    to avoid hardcoding. Used by App.jsx to render the product grid.
    """
    try:
       
        products = Product.objects.filter(active=True).values(
            'id', 'name', 'price', 'stock'
        )
        return Response(list(products), status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



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
                
                
                product = Product.objects.select_for_update().get(id=product_id, active=True)

                if product.stock < 1:
                    return Response({"error": "Out of stock"}, status=status.HTTP_409_CONFLICT)

                
                wallet, _ = Wallet.objects.select_for_update().get_or_create(
                    user_id=user_id, 
                    defaults={"balance": Decimal("0.00")}
                )

                if wallet.balance < product.price:
                    return Response({"error": "Insufficient funds"}, status=status.HTTP_402_PAYMENT_REQUIRED)

                
                wallet.balance -= product.price
                wallet.save()

               
                if request.headers.get('X-Simulate-Failure'):
                     raise Exception("Simulated Atomicity Failure")

                
                product.stock -= 1
                product.save()

                
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
            
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
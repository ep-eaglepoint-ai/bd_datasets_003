set -e

echo "Starting Backend Entrypoint..."


python manage.py migrate --noinput


echo "Checking for seed data..."
python manage.py shell -c "
from inventory.models import Product, Wallet
from decimal import Decimal

if not Product.objects.exists():
    print('Seeding database...')
    Product.objects.get_or_create(id=1, defaults={'name': 'Gaming Laptop', 'stock': 5, 'price': Decimal('999.00'), 'active': True})
    Product.objects.get_or_create(id=2, defaults={'name': 'Mechanical Keyboard', 'stock': 20, 'price': Decimal('149.00'), 'active': True})
    Product.objects.get_or_create(id=3, defaults={'name': 'Wireless Mouse', 'stock': 15, 'price': Decimal('79.00'), 'active': True})
    
    Wallet.objects.get_or_create(user_id=1, defaults={'balance': Decimal('2000.00')})
    Wallet.objects.get_or_create(user_id=2, defaults={'balance': Decimal('50.00')})
    print('Seed Data Created Successfully')
else:
    print('Data already exists, skipping seed.')
"


exec "$@"
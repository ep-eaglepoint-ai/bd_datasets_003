import os
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from decimal import Decimal

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL', 'postgresql://localhost/ecommerce'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    inventory_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_email = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), default='pending')
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_status = db.Column(db.String(20), default='pending')
    tracking_number = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    fulfilled_at = db.Column(db.DateTime)
    cancelled_at = db.Column(db.DateTime)

class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price_at_purchase = db.Column(db.Numeric(10, 2), nullable=False)
    
    order = db.relationship('Order', backref='items')
    product = db.relationship('Product')

class Refund(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    reason = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    processed_at = db.Column(db.DateTime)
    
    order = db.relationship('Order', backref='refunds')

@app.route('/api/products', methods=['GET'])
def get_products():
    products = Product.query.filter(Product.inventory_count > 0).all()
    return jsonify([{
        'id': p.id,
        'name': p.name,
        'price': float(p.price),
        'inventory': p.inventory_count
    } for p in products]), 200

@app.route('/api/products/<int:product_id>', methods='GET'])
def get_product(product_id):
    product = Product.query.get_or_404(product_id)
    return jsonify({
        'id': product.id,
        'name': product.name,
        'price': float(product.price),
        'inventory': product.inventory_count
    }), 200

@app.route('/api/orders', methods=['POST'])
def create_order():
    data = request.json
    
    if not data.get('customer_email') or not data.get('items'):
        return jsonify({'error': 'Missing required fields'}), 400
    
    if not data.get('items'):
        return jsonify({'error': 'Order must contain at least one item'}), 400
    
    total = Decimal('0.00')
    order_items = []
    
    for item in data['items']:
        if item.get('quantity', 0) <= 0:
            return jsonify({'error': 'Quantity must be positive'}), 400
        
        product = Product.query.get(item['product_id'])
        if not product:
            return jsonify({'error': f'Product {item["product_id"]} not found'}), 404
        
        if product.inventory_count < item['quantity']:
            return jsonify({
                'error': f'Insufficient inventory for {product.name}',
                'available': product.inventory_count,
                'requested': item['quantity']
            }), 400
        
        item_total = product.price * item['quantity']
        total += item_total
        
        order_items.append({
            'product': product,
            'quantity': item['quantity'],
            'price': product.price
        })
    
    order = Order(
        customer_email=data['customer_email'],
        total_amount=total
    )
    db.session.add(order)
    db.session.flush()
    
    for item_data in order_items:
        order_item = OrderItem(
            order_id=order.id,
            product_id=item_data['product'].id,
            quantity=item_data['quantity'],
            price_at_purchase=item_data['price']
        )
        db.session.add(order_item)
        
        item_data['product'].inventory_count -= item_data['quantity']
    
    db.session.commit()
    
    return jsonify({
        'order_id': order.id,
        'total': float(order.total_amount),
        'status': order.status,
        'payment_status': order.payment_status
    }), 201

@app.route('/api/orders/<int:order_id>', methods=['GET'])
def get_order(order_id):
    order = Order.query.get_or_404(order_id)
    
    items = []
    for item in order.items:
        items.append({
            'product_id': item.product_id,
            'product_name': item.product.name,
            'quantity': item.quantity,
            'price': float(item.price_at_purchase),
            'subtotal': float(item.price_at_purchase * item.quantity)
        })
    
    return jsonify({
        'order_id': order.id,
        'customer_email': order.customer_email,
        'status': order.status,
        'payment_status': order.payment_status,
        'total': float(order.total_amount),
        'items': items,
        'tracking_number': order.tracking_number,
        'created_at': order.created_at.isoformat(),
        'fulfilled_at': order.fulfilled_at.isoformat() if order.fulfilled_at else None
    }), 200

@app.route('/api/orders/<int:order_id>', methods=['DELETE'])
def cancel_order(order_id):
    order = Order.query.get_or_404(order_id)
    
    if order.status not in ['pending', 'processing']:
        return jsonify({
            'error': 'Cannot cancel order in current status',
            'current_status': order.status
        }), 400
    
    for item in order.items:
        product = Product.query.get(item.product_id)
        product.inventory_count += item.quantity
    
    order.status = 'cancelled'
    order.cancelled_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'message': 'Order cancelled successfully'}), 200

@app.route('/api/orders/<int:order_id>/payment', methods=['POST'])
def process_payment(order_id):
    order = Order.query.get_or_404(order_id)
    
    if order.payment_status == 'completed':
        return jsonify({'error': 'Payment already processed'}), 400
    
    if order.status == 'cancelled':
        return jsonify({'error': 'Cannot process payment for cancelled order'}), 400
    
    data = request.json
    payment_method = data.get('payment_method', 'credit_card')
    
    order.payment_status = 'completed'
    order.status = 'processing'
    db.session.commit()
    
    return jsonify({
        'message': 'Payment processed successfully',
        'order_id': order.id,
        'amount': float(order.total_amount)
    }), 200

@app.route('/api/orders/<int:order_id>/fulfill', methods=['POST'])
def fulfill_order(order_id):
    order = Order.query.get_or_404(order_id)
    
    if order.status != 'processing':
        return jsonify({'error': 'Order must be in processing status'}), 400
    
    if order.payment_status != 'completed':
        return jsonify({'error': 'Payment must be completed first'}), 400
    
    data = request.json
    tracking_number = data.get('tracking_number')
    
    order.status = 'shipped'
    order.tracking_number = tracking_number
    order.fulfilled_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': 'Order fulfilled',
        'tracking_number': tracking_number
    }), 200

@app.route('/api/orders/<int:order_id>/refund', methods=['POST'])
def create_refund(order_id):
    order = Order.query.get_or_404(order_id)
    
    if order.payment_status != 'completed':
        return jsonify({'error': 'Cannot refund unpaid order'}), 400
    
    data = request.json
    refund_amount = Decimal(str(data.get('amount', order.total_amount)))
    
    if refund_amount > order.total_amount:
        return jsonify({'error': 'Refund amount exceeds order total'}), 400
    
    if order.created_at < datetime.utcnow() - timedelta(days=30):
        return jsonify({'error': 'Refund window expired (30 days)'}), 400
    
    refund = Refund(
        order_id=order.id,
        amount=refund_amount,
        reason=data.get('reason', ''),
        status='completed',
        processed_at=datetime.utcnow()
    )
    db.session.add(refund)
    
    for item in order.items:
        product = Product.query.get(item.product_id)
        product.inventory_count += item.quantity
    
    order.status = 'refunded'
    db.session.commit()
    
    return jsonify({
        'refund_id': refund.id,
        'amount': float(refund.amount),
        'status': refund.status
    }), 201

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
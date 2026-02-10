from flask import Blueprint, request, jsonify
from app import db
from app.models import InventoryItem, StockMovement
from app.routes.auth import token_required
from app.services.stock_service import StockService

inventory_bp = Blueprint('inventory', __name__)
stock_service = StockService()


@inventory_bp.route('', methods=['GET'])
@token_required
def list_items(current_user):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    pagination = InventoryItem.query.paginate(page=page, per_page=per_page, error_out=False)

    items = [{
        'id': item.id,
        'sku': item.sku,
        'name': item.name,
        'quantity': item.quantity,
        'reserved': item.reserved,
        'available': item.available,
        'reorder_point': item.reorder_point,
        'unit_price': item.unit_price,
        'needs_reorder': item.needs_reorder
    } for item in pagination.items]

    return jsonify({
        'items': items,
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
        'per_page': pagination.per_page
    }), 200


@inventory_bp.route('', methods=['POST'])
@token_required
def create_item(current_user):
    data = request.get_json()

    if not data or not data.get('sku') or not data.get('name') or data.get('unit_price') is None:
        return jsonify({'error': 'Missing required fields: sku, name, unit_price'}), 400

    if InventoryItem.query.filter_by(sku=data['sku']).first():
        return jsonify({'error': 'SKU already exists'}), 409

    item = InventoryItem(
        sku=data['sku'],
        name=data['name'],
        quantity=data.get('quantity', 0),
        reorder_point=data.get('reorder_point', 10),
        unit_price=data['unit_price']
    )
    db.session.add(item)
    db.session.commit()

    return jsonify({
        'id': item.id,
        'sku': item.sku,
        'name': item.name,
        'quantity': item.quantity,
        'unit_price': item.unit_price
    }), 201


@inventory_bp.route('/<int:item_id>', methods=['GET'])
@token_required
def get_item(current_user, item_id):
    item = InventoryItem.query.get(item_id)

    if not item:
        return jsonify({'error': 'Item not found'}), 404

    return jsonify({
        'id': item.id,
        'sku': item.sku,
        'name': item.name,
        'quantity': item.quantity,
        'reserved': item.reserved,
        'available': item.available,
        'reorder_point': item.reorder_point,
        'unit_price': item.unit_price,
        'needs_reorder': item.needs_reorder
    }), 200


@inventory_bp.route('/<int:item_id>', methods=['PUT'])
@token_required
def update_item(current_user, item_id):
    item = InventoryItem.query.get(item_id)

    if not item:
        return jsonify({'error': 'Item not found'}), 404

    data = request.get_json()

    if data.get('name'):
        item.name = data['name']
    if data.get('reorder_point') is not None:
        item.reorder_point = data['reorder_point']
    if data.get('unit_price') is not None:
        item.unit_price = data['unit_price']

    db.session.commit()

    return jsonify({'message': 'Updated'}), 200


@inventory_bp.route('/<int:item_id>', methods=['DELETE'])
@token_required
def delete_item(current_user, item_id):
    item = InventoryItem.query.get(item_id)

    if not item:
        return jsonify({'error': 'Item not found'}), 404

    if item.reserved > 0:
        return jsonify({'error': 'Cannot delete item with reserved stock'}), 400

    db.session.delete(item)
    db.session.commit()

    return jsonify({'message': 'Deleted'}), 200


@inventory_bp.route('/<int:item_id>/adjust', methods=['POST'])
@token_required
def adjust_stock(current_user, item_id):
    data = request.get_json()

    if not data or data.get('quantity') is None or not data.get('type'):
        return jsonify({'error': 'Missing required fields: quantity, type'}), 400

    valid_types = ['IN', 'OUT', 'ADJUSTMENT']
    if data['type'] not in valid_types:
        return jsonify({'error': f'Invalid movement type. Must be one of: {valid_types}'}), 400

    try:
        result = stock_service.adjust_stock(
            item_id=item_id,
            quantity=data['quantity'],
            movement_type=data['type'],
            reference=data.get('reference')
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@inventory_bp.route('/<int:item_id>/reserve', methods=['POST'])
@token_required
def reserve_stock(current_user, item_id):
    data = request.get_json()

    if not data or data.get('quantity') is None:
        return jsonify({'error': 'Missing required field: quantity'}), 400

    try:
        result = stock_service.reserve_stock(
            item_id=item_id,
            quantity=data['quantity'],
            reference=data.get('reference')
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@inventory_bp.route('/<int:item_id>/release', methods=['POST'])
@token_required
def release_stock(current_user, item_id):
    data = request.get_json()

    if not data or data.get('quantity') is None:
        return jsonify({'error': 'Missing required field: quantity'}), 400

    try:
        result = stock_service.release_reservation(
            item_id=item_id,
            quantity=data['quantity'],
            reference=data.get('reference')
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

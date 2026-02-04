from flask import Blueprint, request, jsonify
from datetime import datetime
from app import db
from app.models import Alert, InventoryItem
from app.routes.auth import token_required
from app.services.stock_service import StockService

alerts_bp = Blueprint('alerts', __name__)
stock_service = StockService()


@alerts_bp.route('', methods=['GET'])
@token_required
def list_alerts(current_user):
    include_resolved = request.args.get('include_resolved', 'false').lower() == 'true'

    query = Alert.query
    if not include_resolved:
        query = query.filter_by(is_resolved=False)

    alerts = query.order_by(Alert.created_at.desc()).all()

    return jsonify({
        'alerts': [{
            'id': alert.id,
            'item_id': alert.item_id,
            'alert_type': alert.alert_type,
            'message': alert.message,
            'is_resolved': alert.is_resolved,
            'created_at': alert.created_at.isoformat()
        } for alert in alerts]
    }), 200


@alerts_bp.route('/<int:alert_id>/resolve', methods=['POST'])
@token_required
def resolve_alert(current_user, alert_id):
    alert = Alert.query.get(alert_id)

    if not alert:
        return jsonify({'error': 'Alert not found'}), 404

    alert.is_resolved = True
    alert.resolved_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'message': 'Alert resolved'}), 200


@alerts_bp.route('/check', methods=['POST'])
@token_required
def check_alerts(current_user):
    new_alerts = stock_service.check_reorder_alerts()

    return jsonify({
        'new_alerts': len(new_alerts),
        'alert_ids': [alert.id for alert in new_alerts]
    }), 200

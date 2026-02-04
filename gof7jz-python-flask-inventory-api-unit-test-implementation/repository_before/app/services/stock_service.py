from app import db
from app.models import InventoryItem, StockMovement, Alert


class StockService:
    def adjust_stock(self, item_id, quantity, movement_type, reference=None):
        item = InventoryItem.query.get(item_id)

        if not item:
            raise ValueError('Item not found')

        if movement_type == 'IN':
            item.quantity += quantity
        elif movement_type == 'OUT':
            if quantity > item.available:
                raise ValueError('Insufficient available stock')
            item.quantity -= quantity
        elif movement_type == 'ADJUSTMENT':
            new_quantity = item.quantity + quantity
            if new_quantity < 0:
                raise ValueError('Stock cannot be negative')
            item.quantity = new_quantity

        movement = StockMovement(
            item_id=item_id,
            movement_type=movement_type,
            quantity=quantity,
            reference=reference
        )
        db.session.add(movement)
        db.session.commit()

        self._check_and_create_alert(item)

        return {
            'new_quantity': item.quantity,
            'available': item.available,
            'movement_id': movement.id
        }

    def reserve_stock(self, item_id, quantity, reference=None):
        item = InventoryItem.query.get(item_id)

        if not item:
            raise ValueError('Item not found')

        if quantity < 0:
            raise ValueError('Cannot reserve negative quantity')

        if quantity > item.available:
            raise ValueError('Insufficient available stock')

        item.reserved += quantity

        movement = StockMovement(
            item_id=item_id,
            movement_type='RESERVE',
            quantity=quantity,
            reference=reference
        )
        db.session.add(movement)
        db.session.commit()

        self._check_and_create_alert(item)

        return {
            'reserved': item.reserved,
            'available': item.available,
            'movement_id': movement.id
        }

    def release_reservation(self, item_id, quantity, reference=None):
        item = InventoryItem.query.get(item_id)

        if not item:
            raise ValueError('Item not found')

        if quantity < 0:
            raise ValueError('Cannot release negative quantity')

        if quantity > item.reserved:
            raise ValueError('Cannot release more than reserved')

        item.reserved -= quantity

        movement = StockMovement(
            item_id=item_id,
            movement_type='RELEASE',
            quantity=quantity,
            reference=reference
        )
        db.session.add(movement)
        db.session.commit()

        return {
            'reserved': item.reserved,
            'available': item.available,
            'movement_id': movement.id
        }

    def check_reorder_alerts(self):
        items = InventoryItem.query.all()
        new_alerts = []

        for item in items:
            if item.needs_reorder:
                existing_alert = Alert.query.filter_by(
                    item_id=item.id,
                    alert_type='LOW_STOCK',
                    is_resolved=False
                ).first()

                if not existing_alert:
                    alert = Alert(
                        item_id=item.id,
                        alert_type='LOW_STOCK',
                        message=f'Item {item.sku} is below reorder point. Available: {item.available}, Reorder point: {item.reorder_point}'
                    )
                    db.session.add(alert)
                    new_alerts.append(alert)

        db.session.commit()
        return new_alerts

    def _check_and_create_alert(self, item):
        if item.needs_reorder:
            existing_alert = Alert.query.filter_by(
                item_id=item.id,
                alert_type='LOW_STOCK',
                is_resolved=False
            ).first()

            if not existing_alert:
                alert = Alert(
                    item_id=item.id,
                    alert_type='LOW_STOCK',
                    message=f'Item {item.sku} is below reorder point. Available: {item.available}, Reorder point: {item.reorder_point}'
                )
                db.session.add(alert)
                db.session.commit()

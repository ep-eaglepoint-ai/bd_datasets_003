from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def create_app(config=None):
    app = Flask(__name__)

    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///inventory.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'dev-secret-key'

    if config:
        app.config.update(config)

    db.init_app(app)

    from app.routes.auth import auth_bp
    from app.routes.inventory import inventory_bp
    from app.routes.alerts import alerts_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(inventory_bp, url_prefix='/api/inventory')
    app.register_blueprint(alerts_bp, url_prefix='/api/alerts')

    with app.app_context():
        db.create_all()

    return app

import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS

# Initialize extensions globally
db = SQLAlchemy()
jwt = JWTManager()

def create_app():
    app = Flask(__name__)

    # Configuration
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, '../reading_tracker.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = 'super-secret-key-that-is-very-long-and-secure-123'

    # Initialize Plugins
    CORS(app)
    db.init_app(app)
    jwt.init_app(app)

    with app.app_context():
        # Import routes and models inside context
        from .routes import api
        from . import models
        
        app.register_blueprint(api, url_prefix='/api')

        # Create the database file
        db.create_all()

    return app
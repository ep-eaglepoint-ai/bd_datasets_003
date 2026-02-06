import time
import hashlib
import jwt
from functools import wraps
from flask import Flask, request, jsonify

app = Flask(__name__)
SECRET_KEY = "your-secret-key"

rate_limits = {}
cache = {}

def authenticate(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({"error": "Missing token"}), 401
        
        try:
            token = token.replace('Bearer ', '')
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            request.user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        
        return f(*args, **kwargs)
    return decorated

def rate_limit(max_requests=10, window=60):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user_id = getattr(request, 'user_id', request.remote_addr)
            current_time = time.time()
            
            if user_id not in rate_limits:
                rate_limits[user_id] = []
            
            rate_limits[user_id] = [t for t in rate_limits[user_id] if current_time - t < window]
            
            if len(rate_limits[user_id]) >= max_requests:
                return jsonify({"error": "Rate limit exceeded"}), 429
            
            rate_limits[user_id].append(current_time)
            return f(*args, **kwargs)
        return decorated
    return decorator

def cache_response(ttl=300):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.method != 'GET':
                return f(*args, **kwargs)
            
            cache_key = hashlib.md5(f"{request.path}{request.query_string}".encode()).hexdigest()
            current_time = time.time()
            
            if cache_key in cache:
                cached_data, timestamp = cache[cache_key]
                if current_time - timestamp < ttl:
                    response = jsonify(cached_data)
                    response.headers['X-Cache'] = 'HIT'
                    return response
            
            result = f(*args, **kwargs)
            if result[1] == 200:
                cache[cache_key] = (result[0].get_json(), current_time)
            return result
        return decorated
    return decorator

@app.route('/api/users', methods=['GET'])
@authenticate
@rate_limit(max_requests=10, window=60)
@cache_response(ttl=300)
def get_users():
    return jsonify({"users": ["user1", "user2", "user3"]}), 200

@app.route('/api/products', methods=['GET'])
@authenticate
@rate_limit(max_requests=10, window=60)
@cache_response(ttl=300)
def get_products():
    return jsonify({"products": ["product1", "product2"]}), 200

@app.route('/api/orders', methods=['POST'])
@authenticate
@rate_limit(max_requests=5, window=60)
def create_order():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Malformed request"}), 400
    return jsonify({"order_id": "12345"}), 201

if __name__ == '__main__':
    app.run(debug=True)
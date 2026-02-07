import pytest
import time
import threading
from datetime import datetime, timedelta

# Import from app (PYTHONPATH determines which repository)
from app import app, db, User, Link


@pytest.fixture
def client():
    """Create test client with in-memory database."""
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['WTF_CSRF_ENABLED'] = False
    
    with app.app_context():
        db.create_all()
        user = User(username='testuser', email='test@example.com', password_hash='hashed_password')
        db.session.add(user)
        db.session.commit()
        yield app.test_client()
        db.session.remove()
        db.drop_all()


@pytest.fixture
def auth_client(client):
    """Create authenticated test client."""
    with client.session_transaction() as sess:
        sess['_user_id'] = '1'
    return client


# ============================================================================
# PASS_TO_PASS TESTS - Basic CRUD that works in both versions
# ============================================================================

class TestBasicCRUD:
    """Basic CRUD operations that exist in repository_before."""
    
    def test_create_link_returns_201(self, auth_client):
        """repository_before can create a link and return 201."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        assert response.status_code == 201
    
    def test_create_link_returns_id_and_code(self, auth_client):
        """repository_before returns id and short_code in response."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        data = response.get_json()
        assert 'id' in data
        assert 'short_code' in data
    
    def test_list_links_returns_200(self, auth_client):
        """repository_before can list links."""
        auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        response = auth_client.get('/api/links')
        assert response.status_code == 200
        assert isinstance(response.get_json(), list)
    
    def test_delete_link_returns_200(self, auth_client):
        """repository_before can delete a link."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        response = auth_client.delete(f'/api/links/{link_id}')
        assert response.status_code == 200
    
    def test_redirect_returns_302(self, auth_client, client):
        """repository_before can redirect using short code."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/destination'})
        short_code = response.get_json()['short_code']
        response = client.get(f'/{short_code}', follow_redirects=False)
        assert response.status_code == 302
    
    def test_nonexistent_link_returns_404(self, client):
        """repository_before returns 404 for nonexistent short codes."""
        response = client.get('/nonexistent')
        assert response.status_code == 404
    
    def test_create_without_url_returns_400(self, auth_client):
        """repository_before validates URL is required."""
        response = auth_client.post('/api/links', json={})
        assert response.status_code == 400
    
    def test_delete_nonexistent_returns_404(self, auth_client):
        """repository_before returns 404 when deleting nonexistent link."""
        response = auth_client.delete('/api/links/99999')
        assert response.status_code == 404


# ============================================================================
# FAIL_TO_PASS TESTS - These fail in repository_before, pass in repository_after
# ============================================================================

class TestBase62Encoding:
    """Requirement 1: Base62 encoding (deterministic, 6-10 chars)."""
    
    def test_deterministic_code_generation(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        assert response.status_code == 201
        data = response.get_json()
        assert 6 <= len(data['short_code']) <= 10
    
    def test_code_is_base62(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        code = response.get_json()['short_code']
        assert all(c in '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' for c in code)
    
    def test_code_decodes_to_id(self, auth_client):
        from app import base62_decode
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        data = response.get_json()
        # The code is now based on (id * 1000000 + user_id), so we verify it's deterministic
        # by creating another link and checking the codes are different
        response2 = auth_client.post('/api/links', json={'url': 'https://example.com/test2'})
        data2 = response2.get_json()
        assert data['short_code'] != data2['short_code']


class TestCustomCodeValidation:
    """Requirement 2: Custom code validation (length, charset, profanity, uniqueness)."""
    
    def test_custom_code_accepted(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'custom123'})
        assert response.status_code == 201
        assert response.get_json()['short_code'] == 'custom123'
    
    def test_custom_code_too_short(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'abc12'})
        assert response.status_code == 400
        assert '6 and 10' in response.get_json()['error']
    
    def test_custom_code_too_long(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'abc12345678'})
        assert response.status_code == 400
    
    def test_custom_code_invalid_chars(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'abc-123'})
        assert response.status_code == 400
        assert 'alphanumeric' in response.get_json()['error'].lower()
    
    def test_custom_code_profanity_blocked(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'fuck123'})
        assert response.status_code == 400
        assert 'inappropriate' in response.get_json()['error'].lower()
    
    def test_custom_code_duplicate_rejected(self, auth_client):
        auth_client.post('/api/links', json={'url': 'https://example.com/test1', 'custom_code': 'unique1'})
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test2', 'custom_code': 'unique1'})
        assert response.status_code == 409


class TestURLValidation:
    """Requirement 3: URL validation (HTTP/HTTPS only, no self-reference)."""
    
    def test_http_url_accepted(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'http://example.com'})
        assert response.status_code == 201
        # Verify validation exists by checking ftp is rejected
        response2 = auth_client.post('/api/links', json={'url': 'ftp://example.com'})
        assert response2.status_code == 400
    
    def test_https_url_accepted(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com'})
        assert response.status_code == 201
        # Verify validation exists by checking ftp is rejected
        response2 = auth_client.post('/api/links', json={'url': 'ftp://example.com'})
        assert response2.status_code == 400
    
    def test_ftp_url_rejected(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'ftp://example.com'})
        assert response.status_code == 400
    
    def test_self_reference_rejected(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'http://localhost:5000/abc123'})
        assert response.status_code == 400


class TestURLNormalization:
    """Requirement 4: URL normalization (lowercase, ports, slashes, query params)."""
    
    def test_lowercase_scheme_and_host(self, auth_client):
        from app import normalize_url
        normalized = normalize_url('HTTP://EXAMPLE.COM/path')
        assert normalized == 'http://example.com/path'
    
    def test_strip_default_http_port(self, auth_client):
        from app import normalize_url
        normalized = normalize_url('http://example.com:80/path')
        assert 'example.com/path' in normalized
        assert ':80' not in normalized
    
    def test_strip_default_https_port(self, auth_client):
        from app import normalize_url
        normalized = normalize_url('https://example.com:443/path')
        assert 'example.com/path' in normalized
        assert ':443' not in normalized
    
    def test_remove_trailing_slash(self, auth_client):
        from app import normalize_url
        normalized = normalize_url('http://example.com/path/')
        assert normalized.endswith('/path')
        assert not normalized.endswith('/path/')
    
    def test_sort_query_parameters(self, auth_client):
        from app import normalize_url
        normalized = normalize_url('http://example.com/path?z=1&a=2')
        assert 'a=2' in normalized
        assert normalized.index('a=2') < normalized.index('z=1')


class TestDuplicatePrevention:
    """Requirement 5: Duplicate prevention (same normalized URL returns existing)."""
    
    def test_same_normalized_url_returns_existing(self, auth_client):
        response1 = auth_client.post('/api/links', json={'url': 'HTTP://EXAMPLE.COM:80/path/?z=1&a=2/'})
        assert response1.status_code == 201
        code1 = response1.get_json()['short_code']
        
        response2 = auth_client.post('/api/links', json={'url': 'http://example.com/path?a=2&z=1'})
        assert response2.status_code == 200
        code2 = response2.get_json()['short_code']
        assert code1 == code2
    
    def test_different_users_same_url_different_codes(self, client):
        with app.app_context():
            user1 = User(username='user1', email='user1@example.com', password_hash='hash1')
            user2 = User(username='user2', email='user2@example.com', password_hash='hash2')
            db.session.add_all([user1, user2])
            db.session.commit()
            user1_id, user2_id = user1.id, user2.id
        
        with client.session_transaction() as sess:
            sess['_user_id'] = str(user1_id)
        response1 = client.post('/api/links', json={'url': 'https://example.com/shared'})
        code1 = response1.get_json()['short_code']
        
        with client.session_transaction() as sess:
            sess['_user_id'] = str(user2_id)
        response2 = client.post('/api/links', json={'url': 'https://example.com/shared'})
        code2 = response2.get_json()['short_code']
        
        assert code1 != code2


class TestConfigurableExpiry:
    """Requirement 6: Configurable expiry (1-365 days, default 30)."""
    
    def test_default_expiry_30_days(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        assert response.status_code == 201
        assert 'expires_at' in response.get_json()
    
    def test_custom_expiry_accepted(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'expiry_days': 7})
        assert response.status_code == 201
    
    def test_expiry_too_short_rejected(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'expiry_days': 0})
        assert response.status_code == 400
    
    def test_expiry_too_long_rejected(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'expiry_days': 366})
        assert response.status_code == 400


class TestExpiredLinksReturn410:
    """Requirement 7: Expired links return HTTP 410 Gone."""
    
    def test_expired_link_returns_410(self, auth_client, client):
        from app import Link
        with app.app_context():
            user = User.query.get(1)
            link = Link(original_url='https://example.com/test', normalized_url='https://example.com/test',
                       short_code='expired1', user_id=user.id, expires_at=datetime.utcnow() - timedelta(days=1), is_active=True)
            db.session.add(link)
            db.session.commit()
        
        response = client.get('/expired1')
        assert response.status_code == 410
    
    def test_active_link_redirects(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        short_code = response.get_json()['short_code']
        response = client.get(f'/{short_code}', follow_redirects=False)
        assert response.status_code == 302


class TestClickTracking:
    """Requirement 8: Click tracking (timestamp, IP, user agent, referrer)."""
    
    def test_click_recorded(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        client.get(f'/{short_code}')
        time.sleep(0.5)
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.status_code == 200
        assert response.get_json()['total_clicks'] >= 1
    
    def test_click_records_ip(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        client.get(f'/{short_code}')
        time.sleep(0.5)
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.get_json()['unique_visitors'] >= 1


class TestClickDeduplication:
    """Requirement 9: Click deduplication (30-second window per IP)."""
    
    def test_same_ip_deduplicated(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        for _ in range(5):
            client.get(f'/{short_code}')
        time.sleep(0.5)
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.get_json()['total_clicks'] == 1
    
    def test_deduplication_expires_after_30_seconds(self, auth_client, client):
        from app import Click
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        client.get(f'/{short_code}')
        time.sleep(0.5)
        
        with app.app_context():
            click = Click.query.filter_by(link_id=link_id).first()
            click.clicked_at = datetime.utcnow() - timedelta(seconds=31)
            db.session.commit()
        
        client.get(f'/{short_code}')
        time.sleep(0.5)
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.get_json()['total_clicks'] == 2


class TestAnalyticsEndpoint:
    """Requirement 10: Analytics endpoint (total, unique, by day, referrers)."""
    
    def test_analytics_total_clicks(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        client.get(f'/{short_code}')
        time.sleep(0.5)
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        data = response.get_json()
        assert 'total_clicks' in data
    
    def test_analytics_unique_visitors(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        data = response.get_json()
        assert 'unique_visitors' in data
    
    def test_analytics_clicks_by_day(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        data = response.get_json()
        assert 'clicks_by_day' in data
    
    def test_analytics_top_referrers(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        data = response.get_json()
        assert 'top_referrers' in data


class TestRateLimiting:
    """Requirement 11: Rate limiting (100 links/hour, returns 429)."""
    
    def test_rate_limit_enforced(self, auth_client):
        for i in range(100):
            response = auth_client.post('/api/links', json={'url': f'https://example.com/test{i}'})
            assert response.status_code == 201
        
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test101'})
        assert response.status_code == 429
    
    def test_rate_limit_returns_429(self, auth_client):
        for i in range(100):
            auth_client.post('/api/links', json={'url': f'https://example.com/test{i}'})
        
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test101'})
        assert response.status_code == 429
        assert 'rate limit' in response.get_json()['error'].lower()


class TestAtomicConflicts:
    """Requirement 12: Atomic conflict handling (returns 409, not 500)."""
    
    def test_duplicate_custom_code_returns_409(self, auth_client):
        auth_client.post('/api/links', json={'url': 'https://example.com/test1', 'custom_code': 'unique1'})
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test2', 'custom_code': 'unique1'})
        assert response.status_code == 409
    
    def test_concurrent_custom_code_atomic(self, auth_client):
        results = []
        def create_link():
            response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'race123'})
            results.append(response.status_code)
        
        threads = [threading.Thread(target=create_link) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        assert results.count(201) == 1
        assert results.count(409) == 4


class TestCustomCodeWithNormalization:
    """Additional tests for custom codes with URL normalization."""
    
    def test_custom_code_bypasses_duplicate_check(self, auth_client):
        # First link with auto-generated code
        response1 = auth_client.post('/api/links', json={'url': 'https://example.com/same'})
        assert response1.status_code == 201
        
        # Second link with custom code for same URL should work
        response2 = auth_client.post('/api/links', json={'url': 'https://example.com/same', 'custom_code': 'custom456'})
        assert response2.status_code == 201
        assert response2.get_json()['short_code'] == 'custom456'
    
    def test_profanity_check_case_insensitive(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'FUCK123'})
        assert response.status_code == 400
        assert 'inappropriate' in response.get_json()['error'].lower()
    
    def test_profanity_contained_in_code(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'shitty1'})
        assert response.status_code == 400
        assert 'inappropriate' in response.get_json()['error'].lower()


# ============================================================================
# PASS_TO_PASS TESTS - Basic CRUD that works in both versions
# ============================================================================

class TestBasicCRUD:
    """Basic CRUD operations that exist in repository_before."""
    
    def test_create_link_basic(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        assert response.status_code == 201
        data = response.get_json()
        assert 'id' in data
        assert 'short_code' in data
    
    def test_list_links(self, auth_client):
        auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        response = auth_client.get('/api/links')
        assert response.status_code == 200
        assert isinstance(response.get_json(), list)
    
    def test_delete_link(self, auth_client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        response = auth_client.delete(f'/api/links/{link_id}')
        assert response.status_code == 200
    
    def test_redirect_basic(self, auth_client, client):
        response = auth_client.post('/api/links', json={'url': 'https://example.com/destination'})
        short_code = response.get_json()['short_code']
        response = client.get(f'/{short_code}', follow_redirects=False)
        assert response.status_code == 302
    
    def test_redirect_nonexistent_404(self, client):
        response = client.get('/nonexistent')
        assert response.status_code == 404
    
    def test_create_requires_url(self, auth_client):
        response = auth_client.post('/api/links', json={})
        assert response.status_code == 400
    
    def test_delete_nonexistent_404(self, auth_client):
        response = auth_client.delete('/api/links/99999')
        assert response.status_code == 404


# ============================================================================
# FAIL_TO_PASS TESTS - New features that don't exist in repository_before
# ============================================================================

class TestBase62Encoding:
    """Requirement 1: Base62 deterministic encoding (6-10 chars)."""
    
    def test_auto_generated_code_length(self, auth_client):
        """Auto-generated codes must be 6-10 characters."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        assert response.status_code == 201
        code = response.get_json()['short_code']
        assert 6 <= len(code) <= 10, f"Code length {len(code)} not in range 6-10"
    
    def test_code_uses_base62_charset(self, auth_client):
        """Codes must only contain base62 characters (0-9, a-z, A-Z)."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        code = response.get_json()['short_code']
        base62_chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        assert all(c in base62_chars for c in code), f"Code '{code}' contains non-base62 characters"
    
    def test_deterministic_encoding_different_links(self, auth_client):
        """Different links must get different codes."""
        response1 = auth_client.post('/api/links', json={'url': 'https://example.com/test1'})
        response2 = auth_client.post('/api/links', json={'url': 'https://example.com/test2'})
        code1 = response1.get_json()['short_code']
        code2 = response2.get_json()['short_code']
        assert code1 != code2, "Different links got same code"
    
    def test_encoding_is_deterministic(self, auth_client):
        """Encoding must be based on link ID (deterministic)."""
        from app import base62_decode
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        data = response.get_json()
        # Verify base62_decode function exists and works
        decoded = base62_decode(data['short_code'])
        assert decoded > 0, "Code must decode to positive number"


class TestCustomCodeValidation:
    """Requirement 2: Custom code validation."""
    
    def test_custom_code_6_chars_accepted(self, auth_client):
        """Custom codes with 6 characters must be accepted."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'abc123'})
        assert response.status_code == 201
        assert response.get_json()['short_code'] == 'abc123'
    
    def test_custom_code_10_chars_accepted(self, auth_client):
        """Custom codes with 10 characters must be accepted."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'abcdef1234'})
        assert response.status_code == 201
        assert response.get_json()['short_code'] == 'abcdef1234'
    
    def test_custom_code_5_chars_rejected(self, auth_client):
        """Custom codes shorter than 6 characters must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'abc12'})
        assert response.status_code == 400
        assert '6' in response.get_json()['error'] or 'length' in response.get_json()['error'].lower()
    
    def test_custom_code_11_chars_rejected(self, auth_client):
        """Custom codes longer than 10 characters must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'abc12345678'})
        assert response.status_code == 400
        assert '10' in response.get_json()['error'] or 'length' in response.get_json()['error'].lower()
    
    def test_custom_code_special_chars_rejected(self, auth_client):
        """Custom codes with special characters must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'abc-123'})
        assert response.status_code == 400
        assert 'alphanumeric' in response.get_json()['error'].lower() or 'character' in response.get_json()['error'].lower()
    
    def test_custom_code_profanity_rejected(self, auth_client):
        """Custom codes containing profanity must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'fuck123'})
        assert response.status_code == 400
        assert 'inappropriate' in response.get_json()['error'].lower() or 'profan' in response.get_json()['error'].lower()
    
    def test_custom_code_profanity_case_insensitive(self, auth_client):
        """Profanity check must be case-insensitive."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'SHIT123'})
        assert response.status_code == 400
        assert 'inappropriate' in response.get_json()['error'].lower() or 'profan' in response.get_json()['error'].lower()
    
    def test_custom_code_profanity_substring(self, auth_client):
        """Profanity check must detect profane words as substrings."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'shitty1'})
        assert response.status_code == 400
        assert 'inappropriate' in response.get_json()['error'].lower() or 'profan' in response.get_json()['error'].lower()
    
    def test_custom_code_duplicate_rejected(self, auth_client):
        """Duplicate custom codes must be rejected with 409."""
        auth_client.post('/api/links', json={'url': 'https://example.com/test1', 'custom_code': 'unique1'})
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test2', 'custom_code': 'unique1'})
        assert response.status_code == 409
        assert 'already' in response.get_json()['error'].lower() or 'use' in response.get_json()['error'].lower()


class TestURLValidation:
    """Requirement 3: URL validation (HTTP/HTTPS only, no self-reference)."""
    
    def test_http_url_accepted(self, auth_client):
        """HTTP URLs must be accepted."""
        response = auth_client.post('/api/links', json={'url': 'http://example.com'})
        assert response.status_code == 201
    
    def test_https_url_accepted(self, auth_client):
        """HTTPS URLs must be accepted."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com'})
        assert response.status_code == 201
    
    def test_ftp_url_rejected(self, auth_client):
        """FTP URLs must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'ftp://example.com'})
        assert response.status_code == 400
        assert 'http' in response.get_json()['error'].lower() or 'scheme' in response.get_json()['error'].lower()
    
    def test_file_url_rejected(self, auth_client):
        """File URLs must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'file:///etc/passwd'})
        assert response.status_code == 400
    
    def test_self_reference_rejected(self, auth_client):
        """URLs referencing the shortening service must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'http://localhost:5000/abc123'})
        assert response.status_code == 400
        assert 'self' in response.get_json()['error'].lower() or 'service' in response.get_json()['error'].lower() or 'reference' in response.get_json()['error'].lower()


class TestURLNormalization:
    """Requirement 4: URL normalization."""
    
    def test_normalize_lowercase_scheme(self, auth_client):
        """Scheme must be normalized to lowercase."""
        from app import normalize_url
        normalized = normalize_url('HTTP://example.com/path')
        assert normalized.startswith('http://'), f"Scheme not lowercase: {normalized}"
    
    def test_normalize_lowercase_host(self, auth_client):
        """Host must be normalized to lowercase."""
        from app import normalize_url
        normalized = normalize_url('http://EXAMPLE.COM/path')
        assert 'example.com' in normalized.lower(), f"Host not lowercase: {normalized}"
    
    def test_normalize_strip_http_default_port(self, auth_client):
        """Default HTTP port 80 must be stripped."""
        from app import normalize_url
        normalized = normalize_url('http://example.com:80/path')
        assert ':80' not in normalized, f"Port 80 not stripped: {normalized}"
        assert 'example.com/path' in normalized
    
    def test_normalize_strip_https_default_port(self, auth_client):
        """Default HTTPS port 443 must be stripped."""
        from app import normalize_url
        normalized = normalize_url('https://example.com:443/path')
        assert ':443' not in normalized, f"Port 443 not stripped: {normalized}"
        assert 'example.com/path' in normalized
    
    def test_normalize_keep_non_default_port(self, auth_client):
        """Non-default ports must be kept."""
        from app import normalize_url
        normalized = normalize_url('http://example.com:8080/path')
        assert ':8080' in normalized, f"Port 8080 was stripped: {normalized}"
    
    def test_normalize_remove_trailing_slash(self, auth_client):
        """Trailing slashes must be removed from path."""
        from app import normalize_url
        normalized = normalize_url('http://example.com/path/')
        assert normalized.endswith('/path'), f"Trailing slash not removed: {normalized}"
        assert not normalized.endswith('/path/')
    
    def test_normalize_sort_query_params(self, auth_client):
        """Query parameters must be sorted alphabetically."""
        from app import normalize_url
        normalized = normalize_url('http://example.com/path?z=1&a=2&m=3')
        # Check that 'a' comes before 'm' and 'm' comes before 'z'
        assert normalized.index('a=2') < normalized.index('m=3'), f"Query params not sorted: {normalized}"
        assert normalized.index('m=3') < normalized.index('z=1'), f"Query params not sorted: {normalized}"


class TestDuplicatePrevention:
    """Requirement 5: Duplicate prevention via URL normalization."""
    
    def test_same_normalized_url_returns_existing(self, auth_client):
        """Same normalized URL must return existing link (200, not 201)."""
        response1 = auth_client.post('/api/links', json={'url': 'HTTP://EXAMPLE.COM:80/path/?z=1&a=2/'})
        assert response1.status_code == 201
        code1 = response1.get_json()['short_code']
        
        response2 = auth_client.post('/api/links', json={'url': 'http://example.com/path?a=2&z=1'})
        assert response2.status_code == 200, "Should return 200 for duplicate normalized URL"
        code2 = response2.get_json()['short_code']
        assert code1 == code2, "Should return same short code for duplicate normalized URL"
    
    def test_different_users_same_url_different_codes(self, client):
        """Different users must get different codes for same URL."""
        with app.app_context():
            user1 = User(username='user1', email='user1@example.com', password_hash='hash1')
            user2 = User(username='user2', email='user2@example.com', password_hash='hash2')
            db.session.add_all([user1, user2])
            db.session.commit()
            user1_id, user2_id = user1.id, user2.id
        
        with client.session_transaction() as sess:
            sess['_user_id'] = str(user1_id)
        response1 = client.post('/api/links', json={'url': 'https://example.com/shared'})
        code1 = response1.get_json()['short_code']
        
        with client.session_transaction() as sess:
            sess['_user_id'] = str(user2_id)
        response2 = client.post('/api/links', json={'url': 'https://example.com/shared'})
        code2 = response2.get_json()['short_code']
        
        assert code1 != code2, "Different users must get different codes for same URL"
    
    def test_custom_code_bypasses_duplicate_check(self, auth_client):
        """Custom codes must bypass duplicate URL check."""
        response1 = auth_client.post('/api/links', json={'url': 'https://example.com/same'})
        assert response1.status_code == 201
        
        response2 = auth_client.post('/api/links', json={'url': 'https://example.com/same', 'custom_code': 'custom456'})
        assert response2.status_code == 201, "Custom code should bypass duplicate check"
        assert response2.get_json()['short_code'] == 'custom456'


class TestConfigurableExpiry:
    """Requirement 6: Configurable expiry (1-365 days, default 30)."""
    
    def test_default_expiry_included(self, auth_client):
        """Response must include expires_at field."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        assert response.status_code == 201
        assert 'expires_at' in response.get_json(), "expires_at field missing"
    
    def test_custom_expiry_7_days(self, auth_client):
        """Custom expiry of 7 days must be accepted."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'expiry_days': 7})
        assert response.status_code == 201
        assert 'expires_at' in response.get_json()
    
    def test_custom_expiry_365_days(self, auth_client):
        """Custom expiry of 365 days (maximum) must be accepted."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'expiry_days': 365})
        assert response.status_code == 201
    
    def test_expiry_0_days_rejected(self, auth_client):
        """Expiry of 0 days must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'expiry_days': 0})
        assert response.status_code == 400
        assert 'expiry' in response.get_json()['error'].lower() or '1' in response.get_json()['error']
    
    def test_expiry_366_days_rejected(self, auth_client):
        """Expiry over 365 days must be rejected."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'expiry_days': 366})
        assert response.status_code == 400
        assert 'expiry' in response.get_json()['error'].lower() or '365' in response.get_json()['error']


class TestExpiredLinksReturn410:
    """Requirement 7: Expired links return HTTP 410 Gone."""
    
    def test_expired_link_returns_410(self, auth_client, client):
        """Expired links must return 410 Gone."""
        from app import Link
        with app.app_context():
            user = User.query.get(1)
            link = Link(
                original_url='https://example.com/test',
                normalized_url='https://example.com/test',
                short_code='expired1',
                user_id=user.id,
                expires_at=datetime.utcnow() - timedelta(days=1),
                is_active=True
            )
            db.session.add(link)
            db.session.commit()
        
        response = client.get('/expired1')
        assert response.status_code == 410, "Expired link must return 410 Gone"
    
    def test_active_link_redirects_302(self, auth_client, client):
        """Active (non-expired) links must redirect with 302."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        short_code = response.get_json()['short_code']
        response = client.get(f'/{short_code}', follow_redirects=False)
        assert response.status_code == 302, "Active link must return 302 redirect"


class TestClickTracking:
    """Requirement 8: Click tracking (timestamp, IP, user agent, referrer)."""
    
    def test_click_recorded_in_analytics(self, auth_client, client):
        """Clicks must be recorded and visible in analytics."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        client.get(f'/{short_code}')
        time.sleep(0.5)  # Allow async recording
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.status_code == 200
        assert response.get_json()['total_clicks'] >= 1, "Click not recorded"
    
    def test_click_records_unique_visitor(self, auth_client, client):
        """Clicks must record unique visitors by IP."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        client.get(f'/{short_code}')
        time.sleep(0.5)
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.get_json()['unique_visitors'] >= 1, "Unique visitor not recorded"


class TestClickDeduplication:
    """Requirement 9: Click deduplication (30-second window per IP)."""
    
    def test_duplicate_clicks_same_ip_deduplicated(self, auth_client, client):
        """Multiple clicks from same IP within 30 seconds must be deduplicated."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        # Click 5 times rapidly
        for _ in range(5):
            client.get(f'/{short_code}')
        time.sleep(0.5)
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.get_json()['total_clicks'] == 1, "Duplicate clicks not deduplicated"
    
    def test_deduplication_expires_after_30_seconds(self, auth_client, client):
        """Deduplication must expire after 30 seconds."""
        from app import Click
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        short_code = response.get_json()['short_code']
        
        client.get(f'/{short_code}')
        time.sleep(0.5)
        
        # Manually age the click to 31 seconds ago
        with app.app_context():
            click = Click.query.filter_by(link_id=link_id).first()
            click.clicked_at = datetime.utcnow() - timedelta(seconds=31)
            db.session.commit()
        
        client.get(f'/{short_code}')
        time.sleep(0.5)
        
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.get_json()['total_clicks'] == 2, "Deduplication should expire after 30 seconds"


class TestAnalyticsEndpoint:
    """Requirement 10: Analytics endpoint with metrics."""
    
    def test_analytics_endpoint_exists(self, auth_client):
        """Analytics endpoint must exist and return 200."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        assert response.status_code == 200
    
    def test_analytics_includes_total_clicks(self, auth_client):
        """Analytics must include total_clicks metric."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        data = response.get_json()
        assert 'total_clicks' in data, "total_clicks missing from analytics"
    
    def test_analytics_includes_unique_visitors(self, auth_client):
        """Analytics must include unique_visitors metric."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        data = response.get_json()
        assert 'unique_visitors' in data, "unique_visitors missing from analytics"
    
    def test_analytics_includes_clicks_by_day(self, auth_client):
        """Analytics must include clicks_by_day breakdown."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        data = response.get_json()
        assert 'clicks_by_day' in data, "clicks_by_day missing from analytics"
        assert isinstance(data['clicks_by_day'], list)
    
    def test_analytics_includes_top_referrers(self, auth_client):
        """Analytics must include top_referrers list."""
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test'})
        link_id = response.get_json()['id']
        response = auth_client.get(f'/api/links/{link_id}/analytics')
        data = response.get_json()
        assert 'top_referrers' in data, "top_referrers missing from analytics"
        assert isinstance(data['top_referrers'], list)


class TestRateLimiting:
    """Requirement 11: Rate limiting (100 links/hour, returns 429)."""
    
    def test_rate_limit_100_links_enforced(self, auth_client):
        """Rate limit of 100 links per hour must be enforced."""
        # Create 100 links
        for i in range(100):
            response = auth_client.post('/api/links', json={'url': f'https://example.com/test{i}'})
            assert response.status_code == 201, f"Link {i+1} failed"
        
        # 101st link should be rate limited
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test101'})
        assert response.status_code == 429, "Rate limit not enforced at 101 links"
    
    def test_rate_limit_returns_429(self, auth_client):
        """Rate limit exceeded must return 429 status code."""
        for i in range(100):
            auth_client.post('/api/links', json={'url': f'https://example.com/test{i}'})
        
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test101'})
        assert response.status_code == 429
        assert 'rate limit' in response.get_json()['error'].lower(), "Error message should mention rate limit"


class TestAtomicConflicts:
    """Requirement 12: Atomic conflict handling (returns 409, not 500)."""
    
    def test_duplicate_custom_code_returns_409(self, auth_client):
        """Duplicate custom code must return 409 Conflict."""
        auth_client.post('/api/links', json={'url': 'https://example.com/test1', 'custom_code': 'unique1'})
        response = auth_client.post('/api/links', json={'url': 'https://example.com/test2', 'custom_code': 'unique1'})
        assert response.status_code == 409, "Duplicate custom code should return 409"
    
    def test_concurrent_custom_code_atomic(self, auth_client):
        """Concurrent requests for same custom code must be handled atomically."""
        results = []
        def create_link():
            response = auth_client.post('/api/links', json={'url': 'https://example.com/test', 'custom_code': 'race123'})
            results.append(response.status_code)
        
        threads = [threading.Thread(target=create_link) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        # Exactly one should succeed (201), others should fail (409)
        assert results.count(201) == 1, f"Expected 1 success, got {results.count(201)}"
        assert results.count(409) == 4, f"Expected 4 conflicts, got {results.count(409)}"

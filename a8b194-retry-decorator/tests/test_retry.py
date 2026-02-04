import pytest
import asyncio
import time
from unittest.mock import Mock, patch, call
from repository_after.retry import retry, RetryError

# Define some custom exceptions for testing
class MyError(Exception):
    pass

class OtherError(Exception):
    pass

class TestRetryDecorator:

    def test_retry_sync_success(self):
        mock_func = Mock(return_value="success")
        
        @retry(max_attempts=3)
        def func():
            return mock_func()
            
        assert func() == "success"
        assert mock_func.call_count == 1

    def test_retry_sync_failure(self):
        mock_func = Mock(side_effect=MyError("fail"))
        
        @retry(max_attempts=3, delay=0.1)
        def func():
            return mock_func()
            
        with pytest.raises(RetryError) as excinfo:
            func()
        
        assert excinfo.value.attempts == 3
        assert isinstance(excinfo.value.cause, MyError)
        assert mock_func.call_count == 3

    def test_retry_sync_eventual_success(self):
        # Fail twice, then succeed
        mock_func = Mock(side_effect=[MyError("fail"), MyError("fail"), "success"])
        
        @retry(max_attempts=3, delay=0.01)
        def func():
            return mock_func()
            
        assert func() == "success"
        assert mock_func.call_count == 3

    @pytest.mark.asyncio
    async def test_retry_async_success(self):
        mock_func = Mock(return_value="success")
        
        @retry(max_attempts=3)
        async def func():
            return mock_func()
            
        assert await func() == "success"
        assert mock_func.call_count == 1

    @pytest.mark.asyncio
    async def test_retry_async_failure(self):
        mock_func = Mock(side_effect=MyError("fail"))
        
        @retry(max_attempts=3, delay=0.01)
        async def func():
            return mock_func()
            
        with pytest.raises(RetryError) as excinfo:
            await func()
            
        assert excinfo.value.attempts == 3
        assert isinstance(excinfo.value.cause, MyError)
        assert mock_func.call_count == 3

    def test_retry_backoff_fixed(self):
        with patch("time.sleep") as mock_sleep:
            mock_func = Mock(side_effect=MyError("fail"))
            
            @retry(max_attempts=3, delay=10, backoff="fixed")
            def func():
                mock_func()
                
            with pytest.raises(RetryError):
                func()
                
            # Should sleep 10s twice (after 1st fail, after 2nd fail)
            assert mock_sleep.call_count == 2
            mock_sleep.assert_has_calls([call(10), call(10)])

    def test_retry_backoff_linear(self):
        with patch("time.sleep") as mock_sleep:
            mock_func = Mock(side_effect=MyError("fail"))
            
            @retry(max_attempts=4, delay=10, backoff="linear")
            def func():
                mock_func()
                
            with pytest.raises(RetryError):
                func()
            
            # Linear: delay * attempt
            # Attempt 1 fail -> sleep 10 * 1 = 10
            # Attempt 2 fail -> sleep 10 * 2 = 20
            # Attempt 3 fail -> sleep 10 * 3 = 30
            # Attempt 4 fail -> Raise RetryError (no sleep)
            assert mock_sleep.call_count == 3
            mock_sleep.assert_has_calls([call(10), call(20), call(30)])

    def test_retry_backoff_exponential(self):
        with patch("time.sleep") as mock_sleep:
            mock_func = Mock(side_effect=MyError("fail"))
            
            @retry(max_attempts=4, delay=10, backoff="exponential")
            def func():
                mock_func()
                
            with pytest.raises(RetryError):
                func()
            
            # Exponential: delay * (2 ** (attempt - 1))
            # Attempt 1 fail -> sleep 10 * 2^0 = 10
            # Attempt 2 fail -> sleep 10 * 2^1 = 20
            # Attempt 3 fail -> sleep 10 * 2^2 = 40
            # Attempt 4 fail -> Raise RetryError
            assert mock_sleep.call_count == 3
            mock_sleep.assert_has_calls([call(10), call(20), call(40)])

    def test_retry_specific_exception(self):
        mock_func = Mock(side_effect=OtherError("fail"))
        
        # Only catch MyError, so OtherError should raise immediately
        @retry(max_attempts=3, exceptions=(MyError,))
        def func():
            mock_func()
            
        with pytest.raises(OtherError):
            func()
            
        assert mock_func.call_count == 1

    def test_retry_validation(self):
        with pytest.raises(ValueError):
            retry(max_attempts=0)
        
        with pytest.raises(ValueError):
            retry(delay=-1)
            
        with pytest.raises(ValueError):
            retry(backoff="invalid")

    def test_retry_preserve_metadata(self):
        @retry()
        def original_func():
            """Docstring."""
            pass
            
        assert original_func.__name__ == "original_func"
        assert original_func.__doc__ == "Docstring."

    @pytest.mark.asyncio
    async def test_retry_async_eventual_success(self):
        # Async version: Fail twice, then succeed
        mock_func = Mock(side_effect=[MyError("fail"), MyError("fail"), "success"])
        
        @retry(max_attempts=3, delay=0.01)
        async def func():
            return mock_func()
            
        assert await func() == "success"
        assert mock_func.call_count == 3

    def test_retry_max_attempts_one(self):
        # max_attempts=1 means try once, no retries
        mock_func = Mock(side_effect=MyError("fail"))
        
        @retry(max_attempts=1, delay=0.01)
        def func():
            mock_func()
            
        with pytest.raises(RetryError) as excinfo:
            func()
            
        assert excinfo.value.attempts == 1
        assert mock_func.call_count == 1

    def test_retry_multiple_exception_types(self):
        # Test catching multiple exception types
        mock_func = Mock(side_effect=[ValueError("fail1"), TypeError("fail2"), "success"])
        
        @retry(max_attempts=3, delay=0.01, exceptions=(ValueError, TypeError))
        def func():
            return mock_func()
            
        assert func() == "success"
        assert mock_func.call_count == 3

    def test_retry_error_message(self):
        # Verify RetryError message format
        mock_func = Mock(side_effect=MyError("original error"))
        
        @retry(max_attempts=2, delay=0.01)
        def func():
            mock_func()
            
        with pytest.raises(RetryError) as excinfo:
            func()
            
        error_msg = str(excinfo.value)
        assert "2 attempts" in error_msg
        assert "original error" in error_msg

    def test_retry_zero_delay(self):
        # Test with zero delay (should work)
        mock_func = Mock(side_effect=[MyError("fail"), "success"])
        
        @retry(max_attempts=2, delay=0.0)
        def func():
            return mock_func()
            
        assert func() == "success"
        assert mock_func.call_count == 2

package assert

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// Equal checks deep equality.
func Equal(t *testing.T, expected, actual any, msgAndArgs ...any) bool {
	t.Helper()
	if reflect.DeepEqual(expected, actual) {
		return true
	}
	t.Errorf("assert.Equal failed: expected=%v actual=%v %s", expected, actual, fmt.Sprint(msgAndArgs...))
	return false
}

// NoError asserts err == nil.
func NoError(t *testing.T, err error, msgAndArgs ...any) bool {
	t.Helper()
	if err == nil {
		return true
	}
	t.Errorf("assert.NoError failed: err=%v %s", err, fmt.Sprint(msgAndArgs...))
	return false
}

// Error asserts err != nil.
func Error(t *testing.T, err error, msgAndArgs ...any) bool {
	t.Helper()
	if err != nil {
		return true
	}
	t.Errorf("assert.Error failed: expected error %s", fmt.Sprint(msgAndArgs...))
	return false
}

// ErrorContains asserts err contains substring.
func ErrorContains(t *testing.T, err error, substr string, msgAndArgs ...any) bool {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), substr) {
		t.Errorf("assert.ErrorContains failed: err=%v substr=%s %s", err, substr, fmt.Sprint(msgAndArgs...))
		return false
	}
	return true
}

// True asserts condition is true.
func True(t *testing.T, condition bool, msgAndArgs ...any) bool {
	t.Helper()
	if condition {
		return true
	}
	t.Errorf("assert.True failed: %s", fmt.Sprint(msgAndArgs...))
	return false
}

// False asserts condition is false.
func False(t *testing.T, condition bool, msgAndArgs ...any) bool {
	t.Helper()
	if !condition {
		return true
	}
	t.Errorf("assert.False failed: %s", fmt.Sprint(msgAndArgs...))
	return false
}

// NotNil asserts obj != nil.
func NotNil(t *testing.T, obj any, msgAndArgs ...any) bool {
	t.Helper()
	if obj != nil && !reflect.ValueOf(obj).IsNil() {
		return true
	}
	t.Errorf("assert.NotNil failed: %s", fmt.Sprint(msgAndArgs...))
	return false
}

// Len asserts length.
func Len(t *testing.T, obj any, length int, msgAndArgs ...any) bool {
	t.Helper()
	v := reflect.ValueOf(obj)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Map && v.Kind() != reflect.Array && v.Kind() != reflect.String {
		t.Errorf("assert.Len failed: unsupported type %T %s", obj, fmt.Sprint(msgAndArgs...))
		return false
	}
	if v.Len() == length {
		return true
	}
	t.Errorf("assert.Len failed: expected=%d actual=%d %s", length, v.Len(), fmt.Sprint(msgAndArgs...))
	return false
}

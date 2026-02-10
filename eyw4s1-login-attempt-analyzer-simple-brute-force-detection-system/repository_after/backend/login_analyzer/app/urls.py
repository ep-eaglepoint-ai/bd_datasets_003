from django.urls import path
from . import views

app_name = 'app'

urlpatterns = [
    # Frontend serving
    path('', views.index_view, name='index'),
    
    # API endpoints - minimal per prompt requirements
    path('login_attempts/', views.LoginAttemptListAPIView.as_view(), name='login-attempt-list'),
    path('suspicious/', views.suspicious_activity_view, name='suspicious-activity'),
]

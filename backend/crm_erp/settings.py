"""
Django settings for crm_erp project.
"""
import os
from pathlib import Path
from datetime import timedelta


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: don't run with debug turned on in production!
# Default is False. Developers must explicitly set DJANGO_DEBUG=True in their
# local .env file. This prevents stack traces from leaking in a Docker
# production image that ships without a .env file.
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() == "true"

# SECURITY WARNING: keep the secret key used in production secret!
# DEBUG must be defined first — the guard below references it.
# In development (DEBUG=True) the insecure fallback is allowed so the project
# works out-of-the-box without a .env file.
# In production (DEBUG=False) we refuse to start with a missing or insecure key.
_SECRET_KEY_DEFAULT = "django-insecure-dev-only-key-change-in-production"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", _SECRET_KEY_DEFAULT)

if not DEBUG and SECRET_KEY == _SECRET_KEY_DEFAULT:
    raise RuntimeError(
        "DJANGO_SECRET_KEY env var is not set (or still uses the insecure dev default). "
        "Generate one with:\n"
        "  python -c \"from django.core.management.utils import get_random_secret_key; "
        "print(get_random_secret_key())\"\n"
        "Then set DJANGO_SECRET_KEY=<generated_value> in your .env file."
    )

# ALLOWED_HOSTS - Base configuration
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if host.strip()
]

# Add ngrok domain dynamically if provided
NGROK_DOMAIN = os.getenv("NGROK_DOMAIN", "")
if NGROK_DOMAIN:
    ALLOWED_HOSTS.append(NGROK_DOMAIN)
    ALLOWED_HOSTS.append(f"*.{NGROK_DOMAIN}")
    print(f"✅ Ngrok domain added to ALLOWED_HOSTS: {NGROK_DOMAIN}")

# Application definition
INSTALLED_APPS = [
    # Django apps
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    "django_filters",
    # Third-party apps
    'rest_framework',
    'rest_framework_simplejwt',           # JWT auth
    'rest_framework_simplejwt.token_blacklist',  # needed for logout + BLACKLIST_AFTER_ROTATION
    'corsheaders',
    # Local apps
    'apps.accounts.apps.AccountsConfig',
    'apps.crm',
    'apps.accounting',
    'apps.hr',
    'apps.dashboard',
    'apps.messaging',
    'apps.audit',
    "apps.payroll",
    "apps.stocks",
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.accounts.middleware.PermissionRefreshMiddleware',  # Custom middleware to add X-Permissions-Changed header
]

ROOT_URLCONF = 'crm_erp.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'crm_erp.wsgi.application'

# Database
# NOTE: was previously hardcoded to a Windows-only absolute path
# (C:\Users\msi\Desktop\...\db.sqlite3). Off that one machine, Django would
# silently create a fresh empty db.sqlite3 at that path instead of erroring,
# so the API looked fine but every endpoint returned empty data. Restored to
# a portable, env-configurable path that defaults to the project's real
# db.sqlite3 next to manage.py.
DATABASES = {
    'default': {
        'ENGINE': os.getenv('DB_ENGINE', 'django.db.backends.sqlite3'),
        'NAME': os.getenv('DB_NAME', str(BASE_DIR / 'db.sqlite3')),
        'USER': os.getenv('DB_USER', ''),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', ''),
        'PORT': os.getenv('DB_PORT', ''),
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

EMAIL_BACKEND = os.getenv(
    "DJANGO_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = 'static/'

# CORS Configuration
CORS_ALLOW_ALL_ORIGINS = os.getenv("DJANGO_CORS_ALLOW_ALL_ORIGINS", "False").lower() == "true"

# Base CORS allowed origins from environment
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "DJANGO_CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

# Base CSRF trusted origins from environment
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "DJANGO_CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

# Add ngrok origins dynamically
if NGROK_DOMAIN:
    CORS_ALLOWED_ORIGINS.append(f"https://{NGROK_DOMAIN}")
    CORS_ALLOWED_ORIGINS.append(f"https://*.{NGROK_DOMAIN}")
    CSRF_TRUSTED_ORIGINS.append(f"https://{NGROK_DOMAIN}")
    CSRF_TRUSTED_ORIGINS.append(f"https://*.{NGROK_DOMAIN}")
    print(f"✅ Ngrok origins added to CORS and CSRF: {NGROK_DOMAIN}")

CORS_ALLOW_CREDENTIALS = True

# Additional CORS settings for better compatibility
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# Email
EMAIL_BACKEND = os.getenv(
    "DJANGO_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = os.getenv(
    "DJANGO_DEFAULT_FROM_EMAIL", "no-reply@radiotherapy-center.local"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# REST Framework & JWT Configuration
REST_FRAMEWORK = {
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 10,
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.CookieJWTAuthentication",
    ],
    # FIX #3: IsAuthenticated (not IsAuthenticatedOrReadOnly) as the global default.
    # With IsAuthenticatedOrReadOnly, any anonymous caller can GET /api/crm/patients/,
    # /api/accounting/invoices/, etc. — medical data exposed with zero authentication.
    # Views that genuinely need public access (login, register, password reset) explicitly
    # set permission_classes = [AllowAny] on themselves.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # FIX #5: Rate-limit the login endpoint to block brute-force attacks.
    # LoginThrottle applies only to the LoginView (which sets throttle_classes explicitly).
    # Unauthenticated users: max 10 login attempts / minute.
    # Authenticated users (e.g. hitting /api/token/refresh/): 60 calls / minute.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute",       # general anonymous endpoints
        "user": "300/minute",      # general authenticated endpoints
        "login": "10/minute",      # tight limit on the login endpoint specifically
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'VERIFYING_KEY': None,
    'AUDIENCE': None,
    'ISSUER': None,
    'JWK_URL': None,
    'LEEWAY': 0,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_HEADER_NAME': 'HTTP_AUTHORIZATION',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'USER_AUTHENTICATION_RULE': 'rest_framework_simplejwt.authentication.default_user_authentication_rule',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
    'TOKEN_USER_CLASS': 'rest_framework_simplejwt.models.TokenUser',
    'JTI_CLAIM': 'jti',
    'SLIDING_TOKEN_REFRESH_EXP_CLAIM': 'refresh_exp',
    'SLIDING_TOKEN_LIFETIME': timedelta(minutes=5),
    'SLIDING_TOKEN_REFRESH_LIFETIME': timedelta(days=1),
}

# JWT Cookie Settings
JWT_AUTH_COOKIE = 'access_token'
JWT_AUTH_REFRESH_COOKIE = 'refresh_token'
JWT_AUTH_SAMESITE = 'Lax'
JWT_AUTH_SECURE = False
JWT_AUTH_HTTPONLY = True
JWT_AUTH_PATH = '/'
JWT_AUTH_DOMAIN = None

# Override JWT cookie settings for ngrok (HTTPS)
if NGROK_DOMAIN:
    JWT_AUTH_SECURE = True
    JWT_AUTH_SAMESITE = 'None'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    # Tell Django to trust the X-Forwarded-Proto header from nginx.
    # Without this, Django sees requests as HTTP (nginx internal traffic)
    # even though ngrok is serving them over HTTPS, causing cookie/CSRF
    # rejections and the 403s you're seeing.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    USE_X_FORWARDED_HOST = True
    print(f"✅ Secure cookies enabled for ngrok: {NGROK_DOMAIN}")
    
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Logging configuration for debugging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
        },
        'django.security': {
            'handlers': ['console'],
            'level': 'INFO',
        },
        'corsheaders': {
            'handlers': ['console'],
            'level': 'INFO',
        },
    },
}
"""
Django settings for crm_erp project.
"""
import os
from pathlib import Path
from datetime import timedelta


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
# In production (DEBUG=False) we refuse to start with a missing or insecure key.
# In development, a fallback is allowed so `docker-compose up` still works out-of-the-box
# without a .env file — the key is clearly marked as dev-only.
_SECRET_KEY_DEFAULT = "django-insecure-dev-only-key-change-in-production"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", _SECRET_KEY_DEFAULT)

if not DEBUG and SECRET_KEY == _SECRET_KEY_DEFAULT:
    raise RuntimeError(
        "DJANGO_SECRET_KEY env var is not set (or still uses the insecure dev default). "
        "Generate one with: python -c \"from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())\""
    )

# SECURITY WARNING: don't run with debug turned on in production!
# Default is False. Developers must explicitly set DJANGO_DEBUG=True in their
# .env file. This prevents stack traces from leaking in a Docker production image
# that ships without a .env file.
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() == "true"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if host.strip()
]

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

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = 'static/'

# CORS
# Default is False — only the origins listed in CORS_ALLOWED_ORIGINS are accepted.
# Set DJANGO_CORS_ALLOW_ALL_ORIGINS=True only for local dev if needed; never in production.
CORS_ALLOW_ALL_ORIGINS = os.getenv("DJANGO_CORS_ALLOW_ALL_ORIGINS", "False").lower() == "true"
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "DJANGO_CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "DJANGO_CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
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
        "rest_framework_simplejwt.authentication.JWTAuthentication",
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
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
}
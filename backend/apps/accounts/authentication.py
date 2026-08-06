"""
Custom JWT authentication for cookies.
"""
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """
    Authenticate using JWT from an HttpOnly cookie.
    Falls back to Authorization header when the cookie is absent.
    """

    def authenticate(self, request):
        token = request.COOKIES.get(settings.JWT_AUTH_COOKIE)

        if token is None:
            header = self.get_header(request)
            if header is None:
                return None
            raw_token = self.get_raw_token(header)
            if raw_token is None:
                return None
            token = raw_token

        try:
            validated_token = self.get_validated_token(token)
            user = self.get_user(validated_token)
            return (user, validated_token)
        except (InvalidToken, TokenError):
            return None

    def get_validated_token(self, raw_token):
        from rest_framework_simplejwt.tokens import AccessToken

        return AccessToken(raw_token)

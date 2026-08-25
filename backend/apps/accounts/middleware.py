# apps/accounts/middleware.py

class PermissionRefreshMiddleware:
    """
    Adds a header when user permissions have changed.
    """
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        response = self.get_response(request)
        
        # Only check for authenticated users
        if hasattr(request, 'user') and request.user.is_authenticated:
            # Check if we should refresh
            if hasattr(request, '_permissions_changed'):
                response['X-Permissions-Changed'] = 'true'
        
        return response
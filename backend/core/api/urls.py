from django.urls import path
from .views import receive_prompt, generate_srs

urlpatterns = [
    path('prompt/', receive_prompt),
    path('generate-srs/', generate_srs),
]

from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.conf import settings
client = OpenAI(api_key=settings.OPENAI_API_KEY)


@api_view(['POST'])
def receive_prompt(request):
    prompt = request.data.get("prompt")
    return Response({
        "message": "Prompt received successfully",
        "prompt": prompt
    })


@api_view(['POST'])
def generate_srs(request):
    prompt = request.data.get("prompt")

    # ✅ Read API key directly from Django settings
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    response = client.responses.create(
        model="gpt-5-nano",
        input=f"""
        Generate a complete Software Requirement Specification (SRS) with:
        - Introduction
        - Overall Description
        - Functional Requirements
        - Non-Functional Requirements
        - Assumptions

        Project: {prompt}
        """
    )

    return Response({
        "srs": response.output_text
    })

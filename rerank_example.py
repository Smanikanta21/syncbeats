import os
import requests
import json

# Supply OPENROUTER_API_KEY through the environment; never embed a credential.
OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]

def rerank(query: str, documents: list, model: str = "nvidia/nemotron-3.5-rerank-8b:free", top_n: int = 3):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "query": query,
        "documents": documents,
        "top_n": top_n,
    }
    response = requests.post(
        url="https://openrouter.ai/api/v1/rerank",
        headers=headers,
        data=json.dumps(payload),
    )
    return response.json()

if __name__ == "__main__":
    # Example documents (Note: OpenRouter requires min $0.50 account credit balance to process remote image URLs)
    documents = [
        {"image": "https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg"},
        {"text": "A fluffy cat sitting on a windowsill in the sun."},
        {"text": "A street map of downtown Berlin."}
    ]

    print(f"Reranking {len(documents)} documents for query: 'a photograph of a cat'...\n")
    results = rerank("a photograph of a cat", documents)

    if "results" in results:
        for result in results["results"]:
            document = result["document"]
            source = document.get("image") or document.get("text")
            print(f"Index: {result['index']}, Score: {result['relevance_score']}, Source: {source}")
    elif "error" in results:
        err = results["error"]
        print(f"API Error ({err.get('code')}): {err.get('message')}")
        if err.get("code") == 402:
            print("\nRetrying with text-only documents (free tier without credit balance):")
            text_docs = [
                {"text": "A photograph showing a cute cat playing with yarn."},
                {"text": "A fluffy cat sitting on a windowsill in the sun."},
                {"text": "A street map of downtown Berlin."}
            ]
            res = rerank("a photograph of a cat", text_docs)
            for result in res.get("results", []):
                doc = result["document"]
                print(f"Index: {result['index']}, Score: {result['relevance_score']:.4f}, Source: {doc.get('text')}")

import os
import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:1b")
MAX_NOTES_CHARS = 12000

SYSTEM_PROMPT = """You are StudySaathi, a careful and encouraging study assistant.
Use the student's supplied notes as the main source. Explain clearly and avoid inventing
facts. If the notes do not contain enough information, say so. Keep formatting readable.
The user may ask for simpler explanations, quizzes, or flashcards.
"""

TASK_PROMPTS = {
    "explain": """Explain the notes in beginner-friendly language.
Use this structure:
1. A short summary
2. Key ideas in simple words
3. A concrete example or analogy
4. Important terms to remember
5. A short recap
Do not claim the notes say something they do not say.""",
    "quiz": """Create 5 multiple-choice questions based on the notes.
For each question, give four options labelled A, B, C, D, identify the correct answer,
and explain briefly why it is correct. Include a mix of recall and understanding questions.
Do not include facts unsupported by the notes.""",
    "flashcards": """Create 8 concise revision flashcards based on the notes.
Use this exact format for each card:
FRONT: [question or term]
BACK: [short answer]
Separate cards with a blank line. Keep answers short and useful for revision."""
}

@app.get("/")
def index():
    return render_template("index.html", model=OLLAMA_MODEL)

@app.post("/api/study")
def study():
    data = request.get_json(silent=True) or {}
    notes = (data.get("notes") or "").strip()
    mode = (data.get("mode") or "").strip()

    if not notes:
        return jsonify(error="Paste your study notes first."), 400
    if len(notes) > MAX_NOTES_CHARS:
        return jsonify(error=f"Please keep your notes under {MAX_NOTES_CHARS:,} characters."), 400
    if mode not in TASK_PROMPTS:
        return jsonify(error="Choose Explain, Quiz, or Flashcards."), 400

    prompt = f"""{TASK_PROMPTS[mode]}

STUDENT'S NOTES:
---
{notes}
---

Remember: be supportive, accurate, and grounded in the supplied notes."""

    try:
        response = requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                "stream": False,
                "options": {"temperature": 0.4}
            },
            timeout=180
        )
        response.raise_for_status()
        payload = response.json()
        result = payload.get("message", {}).get("content", "").strip()
        if not result:
            return jsonify(error="The model returned an empty response. Please try again."), 502
        return jsonify(result=result, model=OLLAMA_MODEL)
    except requests.exceptions.ConnectionError:
        return jsonify(error="Couldn't connect to Ollama. Make sure Ollama is running and the model is downloaded."), 503
    except requests.exceptions.Timeout:
        return jsonify(error="The model took too long to respond. Try shorter notes or a smaller model."), 504
    except requests.exceptions.HTTPError:
        return jsonify(error=f"Ollama returned an error. Check that '{OLLAMA_MODEL}' is installed using: ollama list"), 502
    except (ValueError, KeyError):
        return jsonify(error="Couldn't read the model response. Please try again."), 502

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)

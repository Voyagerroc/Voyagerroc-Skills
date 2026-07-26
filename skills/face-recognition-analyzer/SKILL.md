---
name: face-recognition-analyzer
description: Detect and cluster faces in photos using DeepFace (RetinaFace + Facenet) and HDBSCAN. Use when the user asks to analyze, recognize, find faces in photos, or name specific people.
---

# Face Recognition Analyzer (V2)

This skill analyzes photos to detect faces, extract face embeddings using DeepFace, and clusters identical faces across multiple images using HDBSCAN. It has a built-in memory system that remembers known faces across multiple runs.

## Use this skill when

- The user asks to detect, count, cluster, or recognize faces in one or more photos.
- The user wants to identify the same person across different images.
- The user wants persistent naming of known faces between runs.

## Do not use

- The user is not working with image files or does not need facial analysis.
- The user asks for real-time video stream tracking or surveillance workflows.
- The request requires legal, policy, or biometric compliance guidance beyond technical image analysis.

## Instructions

- Install dependencies listed in `requirements.txt` before running any script.
- Run `python scripts/analyze_faces.py /path/to/image_or_directory` to produce JSON output.
- Use `--save-crops` when face thumbnails are needed for visual identification and follow-up naming.
- If the user identifies a generic persona label, run `python scripts/rename_persona.py "<old_name>" "<new_name>"` to persist the name.

## Prerequisites

Install Python dependencies:
```bash
pip install -r requirements.txt
```
(Run this from the skill directory or using absolute paths to `requirements.txt`).

*Note: The first time you run this skill, DeepFace will automatically download the required model weights (~150MB) to your user home directory.*

## Usage

### 1. Analyzing Images

To analyze an image or a directory of images:

```bash
python scripts/analyze_faces.py /path/to/image_or_directory
```

**Viewing Faces (Agent Eyes):**
If you want to visually see the detected faces to identify them, pass the `--save-crops` argument:

```bash
python scripts/analyze_faces.py /path/to/image_or_directory --save-crops
```
This will save small `.jpg` crops of every detected face into the `crops/` directory. The JSON output will include a `crop_path` for each face, allowing you to use a vision tool to look at the image and ask the user "Who is this?".

### Output Format (JSON)

The script outputs a JSON object to standard output:

```json
{
  "images": [
    {
      "path": "/path/to/image.jpg",
      "taken_at": "2023:05:14 12:00:00",
      "faces": [
        {
          "x": 100,
          "y": 150,
          "w": 50,
          "h": 50,
          "score": 0.98,
          "person_id": 0,
          "person_name": "Persona 0",
          "crop_path": "/path/to/crops/a1b2c3d4_face.jpg"
        }
      ]
    }
  ],
  "persons": [
    {
      "id": 0,
      "name": "Persona 0"
    }
  ]
}
```

### 2. Naming People (Agent Memory)

When the analyzer finds a unique person it hasn't seen before, it assigns them a generic name like `"Persona 0"`. These are saved in `state/known_faces.json`.

If the user identifies a person (e.g. "Persona 0 is Ahmet"), you must rename them in the database so the system remembers them forever:

```bash
python scripts/rename_persona.py "Persona 0" "Ahmet"
```

The next time `analyze_faces.py` is run on a new picture of Ahmet, it will automatically label him as `"Ahmet"` instead of creating a new Persona.

## Acknowledgements

The core inspiration and initial architectural foundation for this facial recognition analyzer were derived from the [myPhotos](https://github.com/ancaferro/myPhotos) repository by **ancaferro**. We thank them for their open-source contribution which made this skill possible.

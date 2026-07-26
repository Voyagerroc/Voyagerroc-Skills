"""Analyze photos, detect faces, cluster them using DeepFace and HDBSCAN, with Agent Memory."""

import argparse
import json
import os
import sys
import uuid
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import List, Dict, Any

import cv2
import numpy as np

# Suppress warnings from deepface/tf
warnings.filterwarnings("ignore")
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

try:
    from deepface import DeepFace
    from sklearn.cluster import HDBSCAN
    import exifread
except ImportError:
    print("Error: Missing dependencies. Please run 'pip install -r requirements.txt'")
    sys.exit(1)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state", "known_faces.json")
CROPS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "crops")

# DeepFace settings
MODEL_NAME = "Facenet"
DETECTOR_BACKEND = "retinaface"
DISTANCE_METRIC = "cosine"
# Facenet cosine distance threshold is around 0.40
COSINE_THRESHOLD = 0.35 

def scan_image_files(path: str) -> List[str]:
    if os.path.isfile(path):
        return [path]
    files = []
    for root, _dirs, names in os.walk(path):
        for name in names:
            if os.path.splitext(name)[1].lower() in IMAGE_EXTENSIONS:
                files.append(os.path.join(root, name))
    files.sort()
    return files

def get_exif_timestamp(path: str) -> str:
    try:
        with open(path, "rb") as f:
            tags = exifread.process_file(f, details=False)
            dt = tags.get("EXIF DateTimeOriginal") or tags.get("Image DateTime")
            if dt:
                return str(dt)
    except Exception:
        pass
    return ""

def load_state() -> Dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"personas": [], "next_id": 0}

def save_state(state: Dict):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

def process_single_image(file_path: str, save_crops: bool) -> Dict:
    """Extract faces and embeddings from a single image."""
    result = {
        "path": file_path,
        "taken_at": get_exif_timestamp(file_path),
        "faces": [],
        "error": None
    }
    
    try:
        # We set enforce_detection to False so it doesn't throw exception if no face found
        faces = DeepFace.represent(img_path=file_path, model_name=MODEL_NAME, 
                                   detector_backend=DETECTOR_BACKEND, enforce_detection=False)
        
        # DeepFace returns a list of dictionaries if multiple faces are found
        # If no face is found and enforce_detection=False, it might return a full image embedding
        # We can check if face_confidence is available and > 0
        
        img_cv2 = None
        if save_crops and len(faces) > 0:
            img_cv2 = cv2.imread(file_path)

        for i, face_obj in enumerate(faces):
            # face_obj typically has: embedding, facial_area, face_confidence
            conf = face_obj.get("face_confidence")
            if conf is None or conf < 0.6:
                # Likely not a face or very low confidence
                continue
                
            area = face_obj.get("facial_area", {})
            x, y, w, h = area.get("x", 0), area.get("y", 0), area.get("w", 0), area.get("h", 0)
            
            face_info = {
                "x": int(x),
                "y": int(y),
                "w": int(w),
                "h": int(h),
                "score": float(conf),
                "embedding": face_obj["embedding"], # used temporarily for clustering
                "crop_path": None
            }
            
            if save_crops and img_cv2 is not None:
                os.makedirs(CROPS_DIR, exist_ok=True)
                crop_path = os.path.join(CROPS_DIR, f"{uuid.uuid4().hex[:8]}_face.jpg")
                y1, y2 = max(0, y), y + h
                x1, x2 = max(0, x), x + w
                crop_img = img_cv2[y1:y2, x1:x2]
                if crop_img.size > 0:
                    cv2.imwrite(crop_path, crop_img)
                    face_info["crop_path"] = crop_path

            result["faces"].append(face_info)
            
    except Exception as e:
        result["error"] = str(e)
        
    return result

def cosine_distance(vec1, vec2):
    a = np.array(vec1)
    b = np.array(vec2)
    a_norm = np.linalg.norm(a)
    b_norm = np.linalg.norm(b)
    if a_norm == 0 or b_norm == 0:
        return 1.0
    return 1.0 - np.dot(a, b) / (a_norm * b_norm)

def analyze(path: str, save_crops: bool) -> Dict:
    files = scan_image_files(path)
    state = load_state()
    personas = state.get("personas", [])
    next_id = state.get("next_id", 0)
    
    results = {"images": []}
    
    # Using ProcessPoolExecutor for multi-core processing
    processed_images = []
    with ProcessPoolExecutor() as executor:
        futures = {executor.submit(process_single_image, f, save_crops): f for f in files}
        for future in as_completed(futures):
            res = future.result()
            processed_images.append(res)
            
    # Sort back to original order
    processed_images.sort(key=lambda x: x["path"])
    
    unknown_faces = []
    unknown_embeddings = []
    
    # 1. Match against known personas
    for img_data in processed_images:
        for face in img_data["faces"]:
            emb = face.pop("embedding") # Remove from final JSON
            face["person_id"] = None
            face["person_name"] = None
            
            # Greedy match against known personas
            best_dist = float('inf')
            best_persona = None
            
            for p in personas:
                # Average distance to known embeddings of this persona
                if not p.get("embeddings"):
                    continue
                dists = [cosine_distance(emb, p_emb) for p_emb in p["embeddings"]]
                avg_dist = sum(dists) / len(dists)
                if avg_dist < best_dist:
                    best_dist = avg_dist
                    best_persona = p
                    
            if best_persona and best_dist < COSINE_THRESHOLD:
                # Matched!
                face["person_id"] = best_persona["id"]
                face["person_name"] = best_persona["name"]
                # Update persona embeddings (keep max 10 to avoid bloat)
                if len(best_persona["embeddings"]) < 10:
                    best_persona["embeddings"].append(emb)
            else:
                # Unknown face
                unknown_faces.append(face)
                unknown_embeddings.append(emb)
                
        results["images"].append(img_data)
        
    # 2. Cluster unknown faces using HDBSCAN
    if unknown_embeddings:
        X = np.array(unknown_embeddings)
        # We need cosine distance matrix for HDBSCAN or use metric='euclidean' on l2 normalized
        # Facenet embeddings are not strictly l2 normalized by default, but HDBSCAN euclidean works well.
        
        # Min cluster size 2 means we group even 2 identical faces
        clusterer = HDBSCAN(min_cluster_size=2, min_samples=1, metric='euclidean')
        labels = clusterer.fit_predict(X)
        
        # labels >= 0 are clusters, -1 is noise (unclustered/unique)
        cluster_to_persona = {}
        
        for idx, label in enumerate(labels):
            if label == -1:
                # Create a new persona for this unique face
                new_id = next_id
                next_id += 1
                new_persona = {
                    "id": new_id,
                    "name": f"Persona {new_id}",
                    "embeddings": [unknown_embeddings[idx]]
                }
                personas.append(new_persona)
                
                unknown_faces[idx]["person_id"] = new_id
                unknown_faces[idx]["person_name"] = new_persona["name"]
            else:
                if label not in cluster_to_persona:
                    new_id = next_id
                    next_id += 1
                    new_persona = {
                        "id": new_id,
                        "name": f"Persona {new_id}",
                        "embeddings": []
                    }
                    personas.append(new_persona)
                    cluster_to_persona[label] = new_persona
                
                matched_persona = cluster_to_persona[label]
                if len(matched_persona["embeddings"]) < 10:
                    matched_persona["embeddings"].append(unknown_embeddings[idx])
                    
                unknown_faces[idx]["person_id"] = matched_persona["id"]
                unknown_faces[idx]["person_name"] = matched_persona["name"]
                
    # Save state
    state["personas"] = personas
    state["next_id"] = next_id
    save_state(state)
    
    # Clean up output (remove embeddings from state for JSON size, though they are in state.json)
    # The output JSON returned to the CLI shouldn't contain the heavy embeddings of personas
    out_personas = [{"id": p["id"], "name": p["name"]} for p in personas]
    results["persons"] = out_personas
    
    return results

def main():
    parser = argparse.ArgumentParser(description="Analyze faces in photos with DeepFace & HDBSCAN")
    parser.add_argument("path", help="Path to an image or directory of images")
    parser.add_argument("--save-crops", action="store_true", help="Save cropped faces to crops/ directory")
    args = parser.parse_args()
    
    try:
        results = analyze(args.path, args.save_crops)
        print(json.dumps(results, indent=2))
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()

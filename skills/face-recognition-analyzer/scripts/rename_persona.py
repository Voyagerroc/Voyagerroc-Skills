"""Rename a persona in the known_faces.json state file."""

import argparse
import json
import os
import sys
from pathlib import Path

STATE_FILE = Path(__file__).resolve().parent.parent / "state" / "known_faces.json"

def rename_persona(old_name: str, new_name: str):
    if not os.path.exists(STATE_FILE):
        print(f"Error: State file not found at {STATE_FILE}. Run analyze_faces.py first.")
        sys.exit(1)

    with open(STATE_FILE, "r") as f:
        state = json.load(f)
        
    found = False
    for persona in state.get("personas", []):
        if persona.get("name") == old_name:
            persona["name"] = new_name
            found = True
            break
            
    if not found:
        print(f"Error: Persona '{old_name}' not found.")
        sys.exit(1)
        
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
        
    print(f"Successfully renamed '{old_name}' to '{new_name}'.")

def main():
    parser = argparse.ArgumentParser(description="Rename a persona.")
    parser.add_argument("old_name", help="Current name of the persona (e.g. 'Persona 0')")
    parser.add_argument("new_name", help="New name for the persona")
    args = parser.parse_args()
    
    rename_persona(args.old_name, args.new_name)

if __name__ == "__main__":
    main()

import json
import os
import re
import shutil

# --- Configuration ---
# Assumes the script is in the root of the 'hypernova' project directory
SOURCE_IMAGES_DIR = "hypernova/zPlanetArt"  # Relative to where the script is run
TARGET_IMAGES_BASE_DIR = os.path.join("hypernova", "client", "assets",
                                      "images", "planets")
SYSTEMS_INIT_PATH = os.path.join("hypernova", "server", "data",
                                 "systems_init.json")


def sanitize_name_for_filename(name):
    """Sanitizes a string to be file-system friendly for the base name (without extension)."""
    s_name = name.lower()
    s_name = s_name.replace(' ', '_')
    s_name = re.sub(r'[^\w_]', '',
                    s_name)  # Keep only word characters and underscores
    s_name = re.sub(r'_+', '_',
                    s_name)  # Replace multiple underscores with single
    return s_name


def list_available_pngs(source_dir, already_used_files):
    """Lists .png files in the source directory, excluding those already used."""
    available = []
    try:
        for f_name in os.listdir(source_dir):
            if f_name.lower().endswith(
                    ".png") and f_name not in already_used_files:
                available.append(f_name)
    except FileNotFoundError:
        print(
            f"ERROR: Source image directory not found: {os.path.abspath(source_dir)}"
        )
        return None
    except Exception as e:
        print(f"Error listing files in {source_dir}: {e}")
        return None
    return available


def main():
    print(
        "--- Planet Image Renaming and Assignment Script (Mode: MOVE files) ---"
    )

    if not os.path.isdir(SOURCE_IMAGES_DIR):
        print(
            f"ERROR: Source image directory '{SOURCE_IMAGES_DIR}' not found.")
        print(
            f"Please ensure it exists relative to where you are running this script (expected: {os.path.abspath(SOURCE_IMAGES_DIR)})."
        )
        return

    try:
        with open(SYSTEMS_INIT_PATH, 'r') as f:
            systems_data = json.load(f)
    except FileNotFoundError:
        print(
            f"ERROR: '{SYSTEMS_INIT_PATH}' not found. Make sure the path is correct."
        )
        return
    except json.JSONDecodeError:
        print(f"ERROR: Could not decode JSON from '{SYSTEMS_INIT_PATH}'.")
        return

    if not os.path.exists(TARGET_IMAGES_BASE_DIR):
        os.makedirs(TARGET_IMAGES_BASE_DIR)
        print(f"Created target directory: {TARGET_IMAGES_BASE_DIR}")

    already_used_source_files = set(
    )  # Keep track of source files already moved to prevent issues if script is re-run partially
    modified_count = 0
    user_quit_session = False

    for system_idx, system in enumerate(systems_data):
        if user_quit_session: break
        system_name_original = system.get("name",
                                          f"UnknownSystem_{system_idx}")
        sanitized_system_name = sanitize_name_for_filename(
            system_name_original)

        for planet_idx, planet in enumerate(system.get("planets", [])):
            if user_quit_session: break
            planet_name_original = planet.get("name",
                                              f"UnknownPlanet_{planet_idx}")
            current_image_file = planet.get("imageFile", "")

            print(
                f"\nProcessing Planet: '{planet_name_original}' in System: '{system_name_original}'"
            )
            print(f"Current imageFile in JSON: '{current_image_file}'")

            target_base_filename_no_ext = f"{sanitized_system_name}_{sanitize_name_for_filename(planet_name_original)}"
            target_filename_png = f"{target_base_filename_no_ext}.png"
            target_image_path_in_json = f"planets/{target_filename_png}"
            full_target_path_on_disk = os.path.join(TARGET_IMAGES_BASE_DIR,
                                                    target_filename_png)

            if os.path.exists(
                    full_target_path_on_disk
            ) and current_image_file == target_image_path_in_json:
                print(
                    f"This planet already has '{target_filename_png}' correctly assigned and file exists. Skipping."
                )
                continue

            if os.path.exists(full_target_path_on_disk):
                print(
                    f"NOTE: Target file '{full_target_path_on_disk}' already exists on disk."
                )
                if current_image_file != target_image_path_in_json:
                    print(
                        f"      JSON 'imageFile' is '{current_image_file}'. Consider updating it to '{target_image_path_in_json}'."
                    )
                # Ask if user wants to overwrite the existing target file or re-assign JSON
                overwrite_choice = input(
                    f"      Target file exists. Overwrite it (o), or just update JSON to this file (j), or skip (s)? [o/j/s]: "
                ).lower()
                if overwrite_choice == 's':
                    print("Skipping.")
                    continue
                elif overwrite_choice == 'j':
                    planet["imageFile"] = target_image_path_in_json
                    print(
                        f"Updated JSON for '{planet_name_original}' to use existing '{target_image_path_in_json}'."
                    )
                    modified_count += 1
                    continue  # Skip file operations for this planet
                # else (o or other) proceed to select a source file to overwrite

            available_pngs = list_available_pngs(SOURCE_IMAGES_DIR,
                                                 already_used_source_files)
            if available_pngs is None: return
            if not available_pngs:
                print(
                    "No more .png files available in the source directory ('zPlanetArt') to assign."
                )
                choice = input(
                    "No source images left. Skip this planet (s) or quit and save (q)? [s/q]: "
                ).lower()
                if choice == 'q':
                    user_quit_session = True
                    break
                else:
                    continue

            print("\nAvailable .png files in 'zPlanetArt':")
            for i, png_file in enumerate(available_pngs):
                print(f"  {i+1}: {png_file}")

            while True:  # Loop for user input for current planet
                try:
                    user_choice_str = input(
                        f"Enter number of the .png for '{planet_name_original}' (or 's' to skip, 'q' to quit & save): "
                    )
                    if user_choice_str.lower() == 's':
                        print(f"Skipping planet '{planet_name_original}'.")
                        break  # Breaks from input loop for this planet, goes to next planet
                    if user_choice_str.lower() == 'q':
                        print("Quitting assignment session.")
                        user_quit_session = True
                        break  # Breaks from input loop

                    choice_idx = int(user_choice_str) - 1
                    if 0 <= choice_idx < len(available_pngs):
                        selected_source_png = available_pngs[choice_idx]
                        source_file_path = os.path.join(
                            SOURCE_IMAGES_DIR, selected_source_png)

                        print(
                            f"Moving '{source_file_path}' to '{full_target_path_on_disk}'..."
                        )
                        shutil.move(source_file_path, full_target_path_on_disk
                                    )  # Changed from copy to move

                        planet["imageFile"] = target_image_path_in_json
                        print(
                            f"Updated JSON for '{planet_name_original}' to use '{target_image_path_in_json}'."
                        )

                        already_used_source_files.add(selected_source_png)
                        modified_count += 1
                        break  # Successfully processed this planet
                    else:
                        print("Invalid number. Please try again.")
                except ValueError:
                    print("Invalid input. Please enter a number, 's', or 'q'.")

            if user_quit_session: break  # Propagate quit to outer loops

    # Save the updated systems_data to systems_init.json
    with open(SYSTEMS_INIT_PATH, 'w') as f_out:
        json.dump(systems_data, f_out, indent=4)

    print(f"\n--- Script Finished ---")
    if user_quit_session:
        print("Session quit early by user.")
    else:
        print(f"Processed all planets.")
    print(f"Total changes written to '{SYSTEMS_INIT_PATH}': {modified_count}")
    if modified_count > 0:
        print(
            "Please verify the changes. Files have been MOVED from 'zPlanetArt'."
        )


if __name__ == "__main__":
    main()

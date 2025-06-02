import os
import re

# --- Configuration ---
COMBINED_FILE_PATH = "combined_selected_output.txt"  # Name of your combined file
OUTPUT_DIRECTORY = "."    # Where to recreate the project structure

# Define the exact markers used in your combined file
# The (.*?) part is a capturing group for the filename
# We need to escape special regex characters like '*', '(', ')', '?'
START_MARKER_REGEX = r"^/\* ===== START: (.*?) ===== \*/$"
END_MARKER_REGEX = r"^/\* ===== END: (.*?) ===== \*/$"
# If you don't have an explicit END_MARKER, set END_MARKER_REGEX = None
# and the script will assume content runs until the next START_MARKER or EOF.

# --- Script Logic ---
def unpack_files():
    print(f"Attempting to unpack '{COMBINED_FILE_PATH}' into '{OUTPUT_DIRECTORY}'...")

    if not os.path.exists(COMBINED_FILE_PATH):
        print(f"Error: Combined file '{COMBINED_FILE_PATH}' not found.")
        return

    # Ensure the output directory exists
    os.makedirs(OUTPUT_DIRECTORY, exist_ok=True)
    print(f"Output directory '{OUTPUT_DIRECTORY}' ensured.")

    current_file_original_path = None # To store the path from the START marker
    current_file_path_to_write = None
    current_file_content = []
    files_created_count = 0

    try:
        with open(COMBINED_FILE_PATH, 'r', encoding='utf-8') as infile:
            for line_number, line in enumerate(infile, 1):
                line = line.rstrip('\n') # Preserve original line endings within content

                start_match = re.match(START_MARKER_REGEX, line)
                end_match = END_MARKER_REGEX and re.match(END_MARKER_REGEX, line)

                if start_match:
                    # If we were already collecting content for a file (e.g., malformed input or no END_MARKER for previous)
                    if current_file_path_to_write and current_file_content:
                        print(f"Warning: New file started before '{current_file_original_path}' ended (or no END_MARKER for previous). Writing previous content.")
                        write_content(current_file_path_to_write, current_file_content)
                        files_created_count +=1
                        current_file_content = [] # Reset content

                    original_path = start_match.group(1).strip()
                    current_file_original_path = original_path # Store for matching with END marker if needed
                    current_file_path_to_write = os.path.join(OUTPUT_DIRECTORY, original_path)
                    current_file_content = [] # Reset content for the new file
                    print(f"Found start of: {original_path}")

                elif end_match and current_file_path_to_write:
                    ended_file_path = end_match.group(1).strip()
                    if ended_file_path != current_file_original_path:
                        print(f"Warning: END marker path '{ended_file_path}' does not match START marker path '{current_file_original_path}'. Line: {line_number}")
                        # Decide how to handle: still write, or skip? For now, we'll still write based on START.

                    print(f"Found end of: {ended_file_path}. Writing content to {current_file_path_to_write}")
                    write_content(current_file_path_to_write, current_file_content)
                    files_created_count += 1
                    current_file_original_path = None # Reset
                    current_file_path_to_write = None # Reset: no longer in a file
                    current_file_content = []

                elif current_file_path_to_write: # We are between a START and an (expected) END
                    current_file_content.append(line)

                # This block handles the case where END_MARKER_REGEX is None
                # It's less relevant if you always have explicit END markers, but good for robustness
                elif not END_MARKER_REGEX and current_file_path_to_write and not start_match:
                    current_file_content.append(line)


            # After loop, if there's pending content (e.g., last file didn't have an END_MARKER or file ended at EOF)
            if current_file_path_to_write and current_file_content:
                print(f"Writing remaining content for {current_file_original_path} (EOF reached before explicit END marker).")
                write_content(current_file_path_to_write, current_file_content)
                files_created_count +=1

    except FileNotFoundError:
        print(f"Error: Combined file '{COMBINED_FILE_PATH}' not found.")
        return
    except Exception as e:
        print(f"An error occurred: {e}")
        return

    if files_created_count > 0:
        print(f"\nSuccessfully unpacked {files_created_count} files into '{OUTPUT_DIRECTORY}'.")
    else:
        print(f"\nNo files were unpacked. Check your markers and '{COMBINED_FILE_PATH}'.")


def write_content(file_path_to_write, content_lines):
    """Helper function to write content to a file, creating directories if needed."""
    try:
        # Ensure the directory for the file exists
        dir_name = os.path.dirname(file_path_to_write)
        if dir_name and not os.path.exists(dir_name): # dir_name can be empty if file is in root
            os.makedirs(dir_name, exist_ok=True)
            print(f"  Created directory: {dir_name}")

        with open(file_path_to_write, 'w', encoding='utf-8') as outfile:
            outfile.write('\n'.join(content_lines) + '\n') # Add newlines back, ensure a final newline if content exists
        print(f"  Created file: {file_path_to_write}")
    except Exception as e:
        print(f"  Error writing file {file_path_to_write}: {e}")


if __name__ == "__main__":
    unpack_files()
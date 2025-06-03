import json
import os
import re
from PIL import Image, ImageDraw, ImageFont


# --- Sanitization and Hashing ---
def sanitize_name_for_filename(
        name):  # Not strictly needed here as filenames are from JSON
    s_name = name.lower()
    s_name = s_name.replace(' ', '_')
    s_name = re.sub(r'[^\w_.-]', '', s_name)
    s_name = re.sub(r'_+', '_', s_name)
    return s_name


def simple_hash_for_color(text):
    hash_val = 0
    if text:  # Ensure text is not None or empty
        for char in text:
            hash_val = (hash_val * 31 + ord(char)) & 0xFFFFFFFF
    return hash_val


# --- Placeholder Image Generation ---
placeholder_planet_colors_pil = [
    ("#4A90E2", "#FFFFFF"), ("#F5A623", "#FFFFFF"), ("#7ED321", "#000000"),
    ("#BD10E0", "#FFFFFF"), ("#D0021B", "#FFFFFF"), ("#8B572A", "#FFFFFF"),
    ("#50E3C2", "#000000"), ("#B8E986", "#000000"), ("#4A4A4A", "#FFFFFF"),
    ("#F8E71C", "#000000")
]


def create_placeholder_planet_image(planet_name_on_image,
                                    unique_id_for_color,
                                    filepath,
                                    size=(128, 128)):
    # In the tool environment, os.path.exists might not behave as expected with a real filesystem.
    # For this simulation, we'll assume we always try to create if the script runs.
    # if os.path.exists(filepath):
    #     print(f"Simulating: Skipping '{filepath}', file already exists.")
    #     return

    img = Image.new('RGB', size, color='#202028')
    draw = ImageDraw.Draw(img)

    color_hash = simple_hash_for_color(unique_id_for_color)
    bg_color_hex, text_color_hex = placeholder_planet_colors_pil[
        color_hash % len(placeholder_planet_colors_pil)]

    draw.ellipse((2, 2, size[0] - 3, size[1] - 3),
                 fill=bg_color_hex,
                 outline=text_color_hex,
                 width=1)

    try:
        font_size = max(12, int(size[0] / 9))
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except IOError:
            try:
                font = ImageFont.truetype("DejaVuSans.ttf",
                                          font_size)  # Common on Linux
            except IOError:
                font = ImageFont.load_default()  # Fallback
    except Exception:
        font = ImageFont.load_default()

    words = planet_name_on_image.split(' ')
    lines = []
    current_line = ""
    for word_idx, word in enumerate(words):
        test_line = current_line + word
        if word_idx < len(words) - 1 and current_line:
            test_line_for_bbox = current_line + " " + word
        else:
            test_line_for_bbox = test_line

        bbox = draw.textbbox((0, 0), test_line_for_bbox, font=font)
        text_width = bbox[2] - bbox[0]

        if text_width < size[0] * 0.85:
            current_line = test_line_for_bbox if current_line else word
        else:
            if current_line:
                lines.append(current_line.strip())
            current_line = word
    if current_line:
        lines.append(current_line.strip())

    if not lines and planet_name_on_image:
        lines.append(planet_name_on_image)

    total_text_height_approx = 0
    actual_line_heights = []
    for line_text in lines:
        bbox_l = draw.textbbox((0, 0), line_text, font=font)
        actual_line_heights.append(bbox_l[3] - bbox_l[1])
        total_text_height_approx += (bbox_l[3] - bbox_l[1]) + 2

    if total_text_height_approx > 0: total_text_height_approx -= 2

    text_y = (size[1] - total_text_height_approx) / 2

    for i, line_text in enumerate(lines):
        bbox_l_draw = draw.textbbox((0, 0), line_text, font=font)
        text_width_draw = bbox_l_draw[2] - bbox_l_draw[0]

        position = ((size[0] - text_width_draw) / 2, text_y)
        draw.text(position,
                  line_text,
                  fill=text_color_hex,
                  font=font,
                  anchor="lt")
        text_y += actual_line_heights[i] + 2

    try:
        # Ensure the directory for the specific file exists
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        img.save(filepath, "JPEG", quality=85)
        print(f"Simulating: Created placeholder: '{filepath}'")
    except Exception as e:
        print(f"Simulating: Error saving placeholder '{filepath}': {e}")


# --- Main Script Logic ---
# Using the JSON content directly instead of reading from a file path
systems_init_json_content = """
[
    {
        "name": "George's World (THX-1138)",
        "universeX": 80,
        "universeY": 150,
        "connections": [
            1,
            5
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Planet Alpha",
                "x": 300,
                "y": 300,
                "imageFile": "planets/georges_world_thx1138_planet_alpha.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Satori",
        "universeX": 200,
        "universeY": 150,
        "connections": [
            0,
            2,
            4
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Satoria Prime",
                "x": 250,
                "y": 400,
                "imageFile": "planets/satori_satoria_prime.jpg",
                "planetImageScale": 0.9,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Persephone",
        "universeX": 300,
        "universeY": 120,
        "connections": [
            1,
            3,
            16,
            17
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Persephone II",
                "x": 400,
                "y": 200,
                "imageFile": "planets/persephone_persephone_ii.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Medicine"
                ],
                "consumes": [
                    "Food"
                ]
            }
        ]
    },
    {
        "name": "Zaphod",
        "universeX": 350,
        "universeY": 200,
        "connections": [
            2,
            4,
            8,
            15
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Zaphod Beeblebrox",
                "x": 500,
                "y": 350,
                "imageFile": "planets/zaphod_zaphod_beeblebrox.jpg",
                "planetImageScale": 1.2,
                "produces": [
                    "Electronics"
                ],
                "consumes": [
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Alkaid",
        "universeX": 280,
        "universeY": 250,
        "connections": [
            1,
            3,
            5,
            7
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Alkaid VII",
                "x": 300,
                "y": 500,
                "imageFile": "planets/alkaid_alkaid_vii.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Clotho",
        "universeX": 200,
        "universeY": 280,
        "connections": [
            0,
            4,
            6
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Clotho's Thread",
                "x": 150,
                "y": 300,
                "imageFile": "planets/clotho_clothos_thread.jpg",
                "planetImageScale": 0.9,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Orion",
        "universeX": 250,
        "universeY": 350,
        "connections": [
            5,
            7,
            9
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Orion Nebula Port",
                "x": 400,
                "y": 400,
                "imageFile": "planets/orion_orion_nebula_port.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Medicine",
                    "Food"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Curzon",
        "universeX": 350,
        "universeY": 320,
        "connections": [
            4,
            6,
            8,
            11
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Dax Station",
                "x": 550,
                "y": 250,
                "imageFile": "planets/curzon_dax_station.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Risa",
        "universeX": 380,
        "universeY": 280,
        "connections": [
            3,
            7,
            14
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Pleasure Planet",
                "x": 600,
                "y": 450,
                "imageFile": "planets/risa_pleasure_planet.jpg",
                "planetImageScale": 1.3,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Atropos",
        "universeX": 150,
        "universeY": 400,
        "connections": [
            6,
            10
        ],
        "backgroundFile": "purple_nebula_stars.png",
        "planets": [
            {
                "name": "Atropos Prime",
                "x": 200,
                "y": 200,
                "imageFile": "planets/atropos_atropos_prime.jpg",
                "planetImageScale": 0.8,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food"
                ]
            }
        ]
    },
    {
        "name": "Darven",
        "universeX": 300,
        "universeY": 420,
        "connections": [
            9,
            11,
            29
        ],
        "backgroundFile": "purple_nebula_stars.png",
        "planets": [
            {
                "name": "Darven's Pass",
                "x": 350,
                "y": 350,
                "imageFile": "planets/darven_darvens_pass.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Food",
                    "Medicine"
                ],
                "consumes": [
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Propus",
        "universeX": 450,
        "universeY": 380,
        "connections": [
            7,
            10,
            12,
            28
        ],
        "backgroundFile": "purple_nebula_stars.png",
        "planets": [
            {
                "name": "Propus Major",
                "x": 500,
                "y": 500,
                "imageFile": "planets/propus_propus_major.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Polaris",
        "universeX": 500,
        "universeY": 350,
        "connections": [
            11,
            13,
            14,
            43
        ],
        "backgroundFile": "purple_nebula_stars.png",
        "planets": [
            {
                "name": "North Star Port",
                "x": 600,
                "y": 200,
                "imageFile": "planets/polaris_north_star_port.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Electronics"
                ],
                "consumes": [
                    "Food"
                ]
            }
        ]
    },
    {
        "name": "Rigel",
        "universeX": 600,
        "universeY": 350,
        "connections": [
            12,
            22,
            23,
            43
        ],
        "backgroundFile": "purple_nebula_stars.png",
        "planets": [
            {
                "name": "Rigel Kentaurus",
                "x": 700,
                "y": 300,
                "imageFile": "planets/rigel_rigel_kentaurus.jpg",
                "planetImageScale": 1.2,
                "produces": [
                    "Food",
                    "Medicine"
                ],
                "consumes": [
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Matar",
        "universeX": 550,
        "universeY": 300,
        "connections": [
            8,
            12,
            15,
            19
        ],
        "backgroundFile": "purple_nebula_stars.png",
        "planets": [
            {
                "name": "Matar IV",
                "x": 400,
                "y": 550,
                "imageFile": "planets/matar_matar_iv.jpg",
                "planetImageScale": 0.9,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Electronics",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Yemuro",
        "universeX": 500,
        "universeY": 250,
        "connections": [
            3,
            14,
            16,
            18
        ],
        "backgroundFile": "purple_nebula_stars.png",
        "planets": [
            {
                "name": "Yemuro Station",
                "x": 300,
                "y": 150,
                "imageFile": "planets/yemuro_yemuro_station.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Electronics"
                ],
                "consumes": [
                    "Food",
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Turin",
        "universeX": 500,
        "universeY": 150,
        "connections": [
            2,
            15,
            17,
            18
        ],
        "backgroundFile": "ice_field_background.png",
        "planets": [
            {
                "name": "Turin's Shroud",
                "x": 450,
                "y": 250,
                "imageFile": "planets/turin_turins_shroud.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Cygnus",
        "universeX": 550,
        "universeY": 100,
        "connections": [
            2,
            16,
            41,
            42
        ],
        "backgroundFile": "ice_field_background.png",
        "planets": [
            {
                "name": "Cygnus X-1",
                "x": 600,
                "y": 100,
                "imageFile": "planets/cygnus_cygnus_x1.jpg",
                "planetImageScale": 0.9,
                "produces": [
                    "Electronics"
                ],
                "consumes": [
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Kathoon",
        "universeX": 600,
        "universeY": 180,
        "connections": [
            15,
            16,
            19,
            20
        ],
        "backgroundFile": "ice_field_background.png",
        "planets": [
            {
                "name": "Kathoon Prime",
                "x": 700,
                "y": 200,
                "imageFile": "planets/kathoon_kathoon_prime.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Levo",
        "universeX": 650,
        "universeY": 300,
        "connections": [
            14,
            18,
            21,
            22
        ],
        "backgroundFile": "ice_field_background.png",
        "planets": [
            {
                "name": "Levo System",
                "x": 800,
                "y": 400,
                "imageFile": "planets/levo_levo_system.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Medicine",
                    "Food"
                ],
                "consumes": [
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Spica",
        "universeX": 700,
        "universeY": 200,
        "connections": [
            18,
            21,
            41
        ],
        "backgroundFile": "ice_field_background.png",
        "planets": [
            {
                "name": "Spica Colony",
                "x": 900,
                "y": 150,
                "imageFile": "planets/spica_spica_colony.jpg",
                "planetImageScale": 1.2,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Electronics",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Vulcan",
        "universeX": 750,
        "universeY": 300,
        "connections": [
            19,
            20,
            22,
            40
        ],
        "backgroundFile": "ice_field_background.png",
        "planets": [
            {
                "name": "Vulcanis",
                "x": 850,
                "y": 350,
                "imageFile": "planets/vulcan_vulcanis.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food",
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Capella",
        "universeX": 700,
        "universeY": 400,
        "connections": [
            13,
            19,
            21,
            23,
            24,
            39
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Capella IV",
                "x": 800,
                "y": 500,
                "imageFile": "planets/capella_capella_iv.jpg",
                "planetImageScale": 0.9,
                "produces": [
                    "Ore",
                    "Electronics"
                ],
                "consumes": [
                    "Food",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Centauri",
        "universeX": 600,
        "universeY": 450,
        "connections": [
            13,
            22,
            24,
            28,
            29
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Alpha Centauri",
                "x": 700,
                "y": 600,
                "imageFile": "planets/centauri_alpha_centauri.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Food",
                    "Medicine",
                    "Electronics"
                ],
                "consumes": [
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Barnard",
        "universeX": 680,
        "universeY": 480,
        "connections": [
            22,
            23,
            25,
            39
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Barnard's Star",
                "x": 750,
                "y": 700,
                "imageFile": "planets/barnard_barnards_star.jpg",
                "planetImageScale": 0.8,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food"
                ]
            }
        ]
    },
    {
        "name": "Eridani",
        "universeX": 700,
        "universeY": 520,
        "connections": [
            24,
            26,
            27,
            39
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Epsilon Eridani",
                "x": 850,
                "y": 650,
                "imageFile": "planets/eridani_epsilon_eridani.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Electronics",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Procyon",
        "universeX": 700,
        "universeY": 600,
        "connections": [
            25,
            27,
            31,
            37
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Procyon B",
                "x": 800,
                "y": 800,
                "imageFile": "planets/procyon_procyon_b.jpg",
                "planetImageScale": 1.2,
                "produces": [
                    "Electronics"
                ],
                "consumes": [
                    "Ore",
                    "Food"
                ]
            }
        ]
    },
    {
        "name": "Sol",
        "universeX": 600,
        "universeY": 550,
        "connections": [
            25,
            26,
            28,
            30,
            31
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Terra",
                "x": 700,
                "y": 750,
                "imageFile": "planets/sol_terra.jpg",
                "planetImageScale": 1.3,
                "produces": [
                    "Medicine",
                    "Electronics",
                    "Food"
                ],
                "consumes": [
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Sirius",
        "universeX": 550,
        "universeY": 500,
        "connections": [
            11,
            23,
            27,
            29,
            30
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Sirius A",
                "x": 650,
                "y": 650,
                "imageFile": "planets/sirius_sirius_a.jpg",
                "planetImageScale": 0.9,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Altair",
        "universeX": 500,
        "universeY": 450,
        "connections": [
            10,
            11,
            23,
            28,
            43
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Altair IV Outpost",
                "x": 550,
                "y": 550,
                "imageFile": "planets/altair_altair_iv_outpost.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Diphidia",
        "universeX": 500,
        "universeY": 600,
        "connections": [
            27,
            28,
            31,
            32,
            34
        ],
        "backgroundFile": "green_nebula_background.png",
        "planets": [
            {
                "name": "Diphidia Mining",
                "x": 600,
                "y": 700,
                "imageFile": "planets/diphidia_diphidia_mining.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Tau Ceti",
        "universeX": 600,
        "universeY": 620,
        "connections": [
            26,
            27,
            30,
            32,
            35
        ],
        "backgroundFile": "green_nebula_background.png",
        "planets": [
            {
                "name": "Tau Ceti e",
                "x": 750,
                "y": 850,
                "imageFile": "planets/tau_ceti_tau_ceti_e.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Food",
                    "Medicine"
                ],
                "consumes": [
                    "Electronics",
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Antares",
        "universeX": 550,
        "universeY": 650,
        "connections": [
            30,
            31,
            33,
            34,
            35
        ],
        "backgroundFile": "green_nebula_background.png",
        "planets": [
            {
                "name": "Antares Trade Hub",
                "x": 650,
                "y": 900,
                "imageFile": "planets/antares_antares_trade_hub.jpg",
                "planetImageScale": 1.2,
                "produces": [
                    "Electronics"
                ],
                "consumes": [
                    "Food",
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "Mentos",
        "universeX": 480,
        "universeY": 680,
        "connections": [
            32,
            34,
            44
        ],
        "backgroundFile": "green_nebula_background.png",
        "planets": [
            {
                "name": "Mentos Prime",
                "x": 500,
                "y": 800,
                "imageFile": "planets/mentos_mentos_prime.jpg",
                "planetImageScale": 0.9,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Canopus",
        "universeX": 400,
        "universeY": 700,
        "connections": [
            30,
            32,
            33,
            36,
            38
        ],
        "backgroundFile": "green_nebula_background.png",
        "planets": [
            {
                "name": "Canopus Station",
                "x": 450,
                "y": 950,
                "imageFile": "planets/canopus_canopus_station.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Food",
                    "Medicine"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Pollux",
        "universeX": 600,
        "universeY": 720,
        "connections": [
            31,
            32,
            36,
            37,
            45
        ],
        "backgroundFile": "green_nebula_background.png",
        "planets": [
            {
                "name": "Pollux IV",
                "x": 700,
                "y": 900,
                "imageFile": "planets/pollux_pollux_iv.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Ore",
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Castor",
        "universeX": 550,
        "universeY": 750,
        "connections": [
            34,
            35,
            45
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Gemini Port (Castor)",
                "x": 600,
                "y": 850,
                "imageFile": "planets/castor_gemini_port_castor.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food",
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "Vega",
        "universeX": 700,
        "universeY": 700,
        "connections": [
            26,
            35,
            39,
            46
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Vega Colony",
                "x": 800,
                "y": 750,
                "imageFile": "planets/vega_vega_colony.jpg",
                "planetImageScale": 1.1,
                "produces": [
                    "Food",
                    "Medicine"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Olympus",
        "universeX": 300,
        "universeY": 750,
        "connections": [
            34,
            47
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Mount Olympus Base",
                "x": 350,
                "y": 900,
                "imageFile": "planets/olympus_mount_olympus_base.jpg",
                "planetImageScale": 0.9,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food",
                    "Electronics"
                ]
            }
        ]
    },
    {
        "name": "Tiber",
        "universeX": 450,
        "universeY": 780,
        "connections": [
            34,
            38,
            45
        ],
        "backgroundFile": "deep_space_blue.png",
        "planets": [
            {
                "name": "Tiberium Mines",
                "x": 500,
                "y": 900,
                "imageFile": "planets/tiber_tiberium_mines.jpg",
                "planetImageScale": 1.0,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Medicine"
                ]
            }
        ]
    },
    {
        "name": "NGC-5465",
        "universeX": 650,
        "universeY": 150,
        "connections": [
            17,
            18,
            20,
            42
        ],
        "backgroundFile": "ice_field_background.png",
        "planets": [
            {
                "name": "NGC-5465 Outpost",
                "x": 750,
                "y": 100,
                "imageFile": "planets/ngc5465_ngc5465_outpost.jpg",
                "planetImageScale": 0.8,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food"
                ]
            }
        ]
    },
    {
        "name": "NGC-1023",
        "universeX": 480,
        "universeY": 80,
        "connections": [
            2,
            17,
            42
        ],
        "backgroundFile": "ice_field_background.png",
        "planets": [
            {
                "name": "Listening Array 1023",
                "x": 400,
                "y": 50,
                "imageFile": "planets/ngc1023_listening_array_1023.jpg",
                "planetImageScale": 0.7,
                "produces": [
                    "Electronics"
                ],
                "consumes": [
                    "Ore"
                ]
            }
        ]
    },
    {
        "name": "NGC-6484",
        "universeX": 50,
        "universeY": 450,
        "connections": [
            9
        ],
        "backgroundFile": "purple_nebula_stars.png",
        "planets": [
            {
                "name": "Deep Space 6484",
                "x": 100,
                "y": 400,
                "imageFile": "planets/ngc6484_deep_space_6484.jpg",
                "planetImageScale": 0.7,
                "produces": [
                    "Ore"
                ],
                "consumes": [
                    "Food"
                ]
            }
        ]
    },
    {
        "name": "Altair",
        "universeX": 500,
        "universeY": 450,
        "connections": [
            11,
            12,
            23,
            28,
            29
        ],
        "backgroundFile": "gold_nebula_background.png",
        "planets": [
            {
                "name": "Altair IV",
                "x": 550,
                "y": 550,
                "imageFile": "planets/altair_altair_iv.jpg",
                "planetImageScale": 1,
                "produces": [
                    "Food"
                ],
                "consumes": [
                    "Electronics"
                ]
            }
        ]
    }
]
"""
base_image_output_dir_relative_to_tool_root = "hypernova/client/assets/images/"  # The 'planets/' part is in imageFile

try:
    # Simulate ensuring the base output directory exists (it will be virtual in the tool)
    # os.makedirs(base_image_output_dir_relative_to_tool_root, exist_ok=True)
    # print(f"Simulating: Ensured base directory: {base_image_output_dir_relative_to_tool_root}")

    systems_data_list = json.loads(systems_init_json_content)
    print(
        f"Simulating: Loaded {len(systems_data_list)} systems from embedded JSON."
    )

    generated_count = 0
    skipped_count = 0

    for system_info in systems_data_list:
        for planet_info in system_info.get("planets", []):
            planet_name = planet_info.get("name", "Unknown Planet")
            image_file_path_in_json = planet_info.get("imageFile")

            if not image_file_path_in_json or not image_file_path_in_json.startswith(
                    "planets/"):
                print(
                    f"Skipping planet '{planet_name}' in system '{system_info.get('name')}' due to invalid imageFile: '{image_file_path_in_json}'"
                )
                skipped_count += 1
                continue

            # Construct the full path where the image should be saved relative to the tool's CWD
            full_output_filepath = os.path.join(
                base_image_output_dir_relative_to_tool_root,
                image_file_path_in_json)

            # Ensure the specific subdirectory (e.g., 'planets') exists
            specific_planet_dir = os.path.dirname(full_output_filepath)
            # os.makedirs(specific_planet_dir, exist_ok=True) # Actual dir creation
            # print(f"Simulating: Ensured subdirectory: {specific_planet_dir}") # Simulate for tool

            unique_id_for_props = os.path.basename(image_file_path_in_json)

            # Check if file exists (simulated for tool, as real os.path.exists won't work as expected)
            # In a real run, you'd use os.path.exists(full_output_filepath)
            # For now, we assume no files exist and will try to generate all.

            create_placeholder_planet_image(planet_name, unique_id_for_props,
                                            full_output_filepath)
            generated_count += 1

    print(f"\nSimulating: Placeholder image file generation attempt complete.")
    print(f"Simulating: Attempted to generate {generated_count} images.")
    print(
        f"Simulating: Skipped {skipped_count} planets due to invalid imageFile format."
    )
    # The following path is relative to where the tool *thinks* its root is.
    # print(f"Simulating: Check the directory: {os.path.abspath(os.path.join(base_image_output_dir_relative_to_tool_root, 'planets'))}")
    print(
        "Note: Actual file creation depends on the tool's environment. The logs show the intended operations."
    )

except json.JSONDecodeError as e:
    print(f"Error decoding embedded systems_init.json: {e}")
except ImportError:
    print(
        "ERROR: Pillow (PIL) library not found. This script requires Pillow: pip install Pillow"
    )
except Exception as e:
    print(f"An unexpected error occurred: {e}")
    import traceback
    traceback.print_exc()

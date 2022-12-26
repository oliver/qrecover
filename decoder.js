//
// Functions for decoding QR code pixel data
//


// character table for Alphanumeric encoding
var alphanumeric_table = new Map([
    [36, " "],
    [37, "$"],
    [38, "%"],
    [39, "*"],
    [40, "+"],
    [41, "-"],
    [42, "."],
    [43, "/"],
    [44, ":"],
    [45, "\uFFFD"],
]);
for (var i = 0; i <= 9; i++) {
    alphanumeric_table.set(i, "" + i); // numbers
}
for (var i = 10; i <= 35; i++) {
    alphanumeric_table.set(i, String.fromCharCode(i - 10 + 65)); // uppercase letters
}


class QRDecoder {
    code_size;
    pixel_data;
    static_areas;
    dynamic_areas;

    constructor (code_size) {
        this.code_size = code_size;
        this.pixel_data = new PixelData(this.code_size);
        this.static_areas = new AreaMap();
        this.dynamic_areas = new AreaMap();
    }

    get_full_mask () {
        const mask_types = {
            0: function (i,j) { return (i+j) % 2 == 0; },
            1: function (i,j) { return i % 2 == 0; },
            2: function (i,j) { return j % 3 == 0; },
            3: function (i,j) { return (i + j) % 3 == 0; },
            4: function (i,j) { return (Math.floor(i/2) + Math.floor(j/3)) % 2 == 0; },
            5: function (i,j) { return (i*j)%2 + (i*j)%3 == 0; },
            6: function (i,j) { return ((i*j)%3 + i*j) % 2 == 0; },
            7: function (i,j) { return ((i*j) % 3 +i+j) % 2 == 0; }
        };

        var mask_value = this.static_areas.get("format_mask_1").value_details.value;
        const mask_bit_function = mask_types[mask_value];

        var mask_data = new PixelData(this.code_size);
        for (var x = 0; x < this.code_size; x++) {
            for (var y = 0; y < this.code_size; y++) {
                // apply mask only for data areas:
                if (!this.static_areas.is_inside(x, y)) {
                    mask_data.set(x, y, mask_bit_function(y, x));
                }
            }
        }

        // 10 101 0000010010
        mask_data.set_pixels_in_regions(this.static_areas.get("format_ec_1").regions, [true, false]);
        mask_data.set_pixels_in_regions(this.static_areas.get("format_ec_2").regions, [true, false]);

        mask_data.set_pixels_in_regions(this.static_areas.get("format_mask_1").regions, [true, false, true]);
        mask_data.set_pixels_in_regions(this.static_areas.get("format_mask_2").regions, [true, false, true]);

        mask_data.set_pixels_in_regions(this.static_areas.get("format_ec_data_1").regions, [false, false, false, false, false, true, false, false, true, false]);
        mask_data.set_pixels_in_regions(this.static_areas.get("format_ec_data_2").regions, [false, false, false, false, false, true, false, false, true, false]);

        return mask_data;
    }

    get_masked_pixels () {
        var mask_data = this.get_full_mask();
        var masked_pixel_data = new PixelData(this.code_size);
        for (var x = 0; x < this.code_size; x++) {
            for (var y = 0; y < this.code_size; y++) {
                masked_pixel_data.set(x, y, this.pixel_data.get(x, y) ^ mask_data.get(x, y));
            }
        }
        return masked_pixel_data;
    }

    get_all_area_objects () {
        return new Map([... this.static_areas, ... this.dynamic_areas]).values();
    }
}


function decode_inner (decoder) {
    // read data bits (into an array of bools):
    var curr_x = code_size-1;
    var curr_y = code_size-1;
    var end_reached = false;
    var bit_array = new Array();
    var bit_offset_to_pixel_position = new Array();
    do {
        var bit_set = decoder.get_masked_pixels().get(curr_x, curr_y);
        bit_array.push(bit_set);
        bit_offset_to_pixel_position.push({"x":curr_x, "y":curr_y});
        [curr_x, curr_y, end_reached] = next_data_pixel_pos(decoder, curr_x, curr_y);
    } while (!end_reached);

    // decode data bits:
    function read_int (bits, offset, len) {
        var result_int = 0;
        for (var i = 0; i < len; i++) {
            if (offset + i >= bits.length) {
                throw "offset " + (offset + i) + " is out of bounds";
            }

            result_int <<= 1;
            if (bits[offset+i]) {
                result_int |= 1;
            }
        }
        return [result_int, offset+len];
    }

    function read_int_and_add_row (bits, offset, len, row_prep_func, row_post_func) {
        var orig_offset = offset;
        var [int_value, read_offset] = read_int(bits, offset, len);

        var region_coordinates = [];
        for (var i = 0; i < len; i++) {
            const pos = bit_offset_to_pixel_position[orig_offset+i];
            region_coordinates.push([pos.x, pos.y, 1, 1]);
        }

        var read_values = {
            "offset":orig_offset,
            "num_bits": len,
            "value":int_value
        };

        var [name, color] = row_prep_func(read_values);
        const new_area = new Area(name + "_" + orig_offset, RegionList.from_nested_arrays(region_coordinates), color, () => { return read_values; });
        decoder.dynamic_areas.add_area(new_area);

        if (row_post_func) {
            row_post_func(read_values, new_area);
        }

        return [int_value, read_offset];
    }

    function calc_num_data_bytes (ec_level) {
        // TODO: this result should also take the size of the QR code into account.
        // Currently this value is only correct for a version-2 code (25x25 pixels)!
        const ec_level_name = error_correction_levels[ec_level][0];
        if (ec_level_name == "L")
            return 34;
        if (ec_level_name == "M")
            return 28;
        if (ec_level_name == "Q")
            return 22;
        if (ec_level_name == "H")
            return 16;
    }

    const ec_level = decoder.static_areas.get("format_ec_1").value_details.value;
    const num_data_bits = calc_num_data_bytes(ec_level) * 8;

    const mode_names = new Map([
        [0b0000, "End of Message"],
        [0b0010, "Alphanumeric"],
        [0b0100, "Byte"],
        [0b0111, "ECI"]
    ]);

    decoder.dynamic_areas = new AreaMap();
    document.getElementById("error_list").innerHTML = "";
    try {
        var text_characters = [];
        var read_offset = 0;
        while (read_offset < bit_array.length) {
            var [mode, read_offset] = read_int_and_add_row(bit_array, read_offset, 4, (read_result) => {
                if (mode_names.get(read_result["value"])) {
                    read_result["desc"] = mode_names.get(read_result["value"]);
                    read_result["valid"] = true;
                } else {
                    read_result["desc"] = "Unsupported mode \"" + read_result["value"] + "\"; decoding aborted";
                    read_result["valid"] = false;
                }
                return ["mode", [255, 0, 0]];
            });

            if (mode == 0b0010) {
                // Alphanumeric encoding
                var [payload_length, read_offset] = read_int_and_add_row(bit_array, read_offset, 9, (read_result) => {
                    return ["payload_length", [255, 192, 255]];
                });

                for (var j = 0; j < Math.floor(payload_length / 2); j++) {
                    var [two_chars, read_offset] = read_int_and_add_row(bit_array, read_offset, 11, (read_result) => {
                        var char2_code = read_result["value"] % 45;
                        var char1_code = (read_result["value"] - char2_code) / 45;
                        read_result["text_payload"] = alphanumeric_table.get(char1_code) + alphanumeric_table.get(char2_code);

                        read_result["desc"] = char1_code + "=" + alphanumeric_table.get(char1_code) + "; " + char2_code + "=" + alphanumeric_table.get(char2_code);
                        return ["two_chars", [255, 255, 192]];
                    }, (read_result, area) => {
                        text_characters.push({"chars": read_result["text_payload"], "area": area });
                    });
                }
                if (payload_length % 2 != 0) {
                    // read additional character
                    var [final_char, read_offset] = read_int_and_add_row(bit_array, read_offset, 6, (read_result) => {
                        read_result["text_payload"] = alphanumeric_table.get(read_result["value"]);

                        read_result["desc"] = read_result["value"] + "=" + alphanumeric_table.get(read_result["value"]);
                        return ["final_char", [255, 255, 192]];
                    }, (read_result, area) => {
                        text_characters.push({"chars": read_result["text_payload"], "area": area });
                    });
                }
                break;
            } else if (mode == 0b0100) {
                // Byte encoding
                var [payload_length, read_offset] = read_int_and_add_row(bit_array, read_offset, 8, (read_result) => {
                    return ["payload_length", [255, 192, 255]];
                });

                for (var j = 0; j < payload_length; j++) {
                    var [byte, read_offset] = read_int_and_add_row(bit_array, read_offset, 8, (read_result) => {
                        read_result["desc"] = "ASCII='" + String.fromCharCode(read_result["value"]) + "'";
                        return ["byte", [255, 255, 192]];
                    }, (read_result, area) => {
                        text_characters.push({"chars": String.fromCharCode(read_result["value"]), "area": area });
                    });
                }
                break;
            } else if (mode == 0b0111) {
                // ECI marker
                var [eci_marker, read_offset] = read_int_and_add_row(bit_array, read_offset, 8, (read_result) => {
                    if (read_result["value"] == 26) {
                        read_result["desc"] = "UTF-8 charset";
                        read_result["valid"] = true;
                    } else {
                        read_result["desc"] = "Unsupported ECI marker \"" + read_result["value"] + "\"";
                        read_result["valid"] = false;
                    }
                    return ["eci_marker", [192, 255, 255]];
                });
            } else {
                // Unsupported mode
                break;
            }
        }

        if (read_offset < num_data_bits - 4) {
            var [mode, read_offset] = read_int_and_add_row(bit_array, read_offset, 4, (read_result) => {
                if (read_result["value"] == 0) {
                    read_result["desc"] = mode_names.get(read_result["value"]);
                    read_result["valid"] = true;
                } else {
                    read_result["desc"] = "Unsupported mode \"" + read_result["value"] + "\" (terminator expected)";
                    read_result["valid"] = false;
                }
                return ["terminator", [255, 0, 0]];
            });
        }
        if (read_offset % 8 != 0) {
            const num_bits_missing_for_byte = 8 - (read_offset % 8);
            var [mode, read_offset] = read_int_and_add_row(bit_array, read_offset, num_bits_missing_for_byte, (read_result) => {
                read_result["desc"] = "Padding Bits"
                if (read_result["value"] == 0) {
                    read_result["valid"] = true;
                } else {
                    read_result["desc"] += " (invalid values; should be 0)";
                    read_result["valid"] = false;
                }
                return ["padding", [255, 255, 192]];
            });
        }
        const valid_padding_values = [236, 17];
        var padding_value_index = 0;
        while (read_offset < num_data_bits) {
            let expected_padding_value = valid_padding_values[padding_value_index];
            padding_value_index++;
            padding_value_index %= 2;
            const pad_length = Math.min(num_data_bits - read_offset, 8);
            var [mode, read_offset] = read_int_and_add_row(bit_array, read_offset, pad_length, (read_result) => {
                read_result["desc"] = "Padding Byte"
                if (read_result["value"] == expected_padding_value) {
                    read_result["valid"] = true;
                } else {
                    read_result["desc"] += " (invalid value; should be " + expected_padding_value + ")";
                    read_result["valid"] = false;
                }
                return ["padding", [255, 255, 192]];
            });
        }
    } catch (ex) {
        var list_element = document.createElement("li");
        list_element.appendChild(document.createTextNode("Note: decoding failed (\"" + ex + "\"); decoding was aborted."));
        document.getElementById("error_list").appendChild(list_element);
    }

    var num_text_characters = 0;
    for (const entry of text_characters) {
        num_text_characters += entry.chars.length;
    }
    document.getElementById("text_payload").innerHTML = "Decoded " + bit_array.length + " data bits; found " + num_text_characters + " characters:<br>";

    const pre_element = document.createElement("pre");
    document.getElementById("text_payload").appendChild(pre_element);

    for (let entry of text_characters) {
        const span_element = document.createElement("span");
        var displayed_chars = entry.chars;
        // TODO: also replace any other characters that would result in a zero-width span:
        displayed_chars = displayed_chars.replace(/\n/, "\u23ce\n");
        span_element.appendChild(document.createTextNode(displayed_chars));
        span_element.addEventListener("mouseover", function (e) {
            highlight_area(entry.area);
        });
        span_element.addEventListener("mouseout", function (e) {
            highlight_area(null);
        });
        entry.area.dom_elements.set("text_payload_span", span_element);
        pre_element.appendChild(span_element);
    }
}


// Returns the actual next data pixel position (taking static areas into account)
function next_data_pixel_pos (decoder, x, y) {
    // simply skip over positions that are inside an area:
    do {
        [x, y, end_reached] = next_position_in_grid(x, y);
        if (end_reached) {
            return [undefined, undefined, true];
        }
    } while (decoder.static_areas.is_inside(x, y));
    return [x, y, false];
}

// Returns the next data pixel position on the grid (regardless of static areas).
function next_position_in_grid (x, y) {
    // skip over vertical timing strip
    if (x == 6) {
        return [x-1, y, false];
    }

    // calculate current direction in zig-zag pattern:
    var going_up, going_left;
    if (x >= 7) {
        // right of vertical timing strip
        going_up =   ((x-7) % 4 < 2);
        going_left = ((x-7) % 2 == 1);
    } else {
        // left of vertical timing strip
        going_up =   (x % 4 >= 2);
        going_left = (x % 2 == 1);
    }

    // follow zig-zag pattern:
    var rx = x, ry = y;
    if (going_left) {
        rx--;
    } else {
        rx++;
        if (going_up) {
            ry--;
        } else {
            ry++;
        }
    }

    if (ry < 0) {
        // turn around at top edge
        rx-=2;
        ry++;
    } else if (ry > code_size-1) {
        // turn around at bottom edge
        rx-=2;
        ry--;
    }

    if (rx < 0) {
        // left edge: end of data bits reached
        return [undefined, undefined, true];
    } else {
        return [rx, ry, false];
    }
}

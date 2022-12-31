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


/// Array of bits (boolean values), from which integer values can be read.
class BitArray extends Array {
    read_offset = 0;

    read_next_int (num_bits) {
        var result_int = 0;
        for (var i = 0; i < num_bits; i++) {
            if (this.read_offset >= this.length) {
                throw "offset " + this.read_offset + " is out of bounds";
            }

            result_int <<= 1;
            if (this[this.read_offset]) {
                result_int |= 1;
            }
            this.read_offset++;
        }
        return result_int;
    }
}


class QRDecoder {
    code_size;
    pixel_data;
    static_areas;
    dynamic_areas;
    error_list = new Array();

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

    decode () {
        this.error_list.length = 0;
        this.static_areas = add_static_areas(this);

        var errors_from_dynamic_areas;
        [this.dynamic_areas, errors_from_dynamic_areas] = add_dynamic_areas(this);
        this.error_list = this.error_list.concat(errors_from_dynamic_areas);

        const errors_from_global_checks = perform_global_checks(this);
        this.error_list = this.error_list.concat(errors_from_global_checks);
    }
}


function add_dynamic_areas (decoder) {
    // read data bits (into an array of bools):
    var curr_x = code_size-1;
    var curr_y = code_size-1;
    var end_reached = false;
    var bit_array = new BitArray();
    var bit_offset_to_pixel_position = new Array();
    do {
        var bit_set = decoder.get_masked_pixels().get(curr_x, curr_y);
        bit_array.push(bit_set);
        bit_offset_to_pixel_position.push({"x":curr_x, "y":curr_y});
        [curr_x, curr_y, end_reached] = next_data_pixel_pos(decoder, curr_x, curr_y);
    } while (!end_reached);

    // decode data bits:

    var new_dynamic_areas = new AreaMap();
    var error_list = new Array();

    function read_int_and_add_row (bits, len, name, color) {
        var orig_offset = bits.read_offset;
        const int_value = bits.read_next_int(len);

        var region_coordinates = [];
        for (var i = 0; i < len; i++) {
            const pos = bit_offset_to_pixel_position[orig_offset+i];
            region_coordinates.push([pos.x, pos.y, 1, 1]);
        }

        const new_area = new Area(name + "_" + orig_offset, RegionList.from_nested_arrays(region_coordinates), color);
        new_area.value_details = {
            "offset": orig_offset,
            "num_bits": len,
            "value": int_value
        };
        new_dynamic_areas.add_area(new_area);

        return [int_value, new_area];
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
    if (num_data_bits > bit_array.length) {
        error_list.push({"desc": "Code does not have enough pixels for the expected number of data bits (internal error?)"});
    }

    const mode_names = new Map([
        [0b0000, "End of Message"],
        [0b0010, "Alphanumeric"],
        [0b0100, "Byte"],
        [0b0111, "ECI"]
    ]);

    try {
        while (bit_array.read_offset < bit_array.length) {
            var [mode, mode_area] = read_int_and_add_row(bit_array, 4, "mode", [255, 0, 0]);
            if (mode_names.get(mode)) {
                mode_area.value_details.desc = mode_names.get(mode_area.value_details.value);
                mode_area.value_details.valid = true;
            } else {
                mode_area.value_details.desc = "Unsupported mode \"" + mode_area.value_details.value + "\"; decoding aborted";
                mode_area.value_details.valid = false;
            }

            if (mode == 0b0010) {
                // Alphanumeric encoding
                var [payload_length, length_area] = read_int_and_add_row(bit_array, 9, "payload_length", [255, 192, 255]);
                const max_payload_length = Math.floor(((num_data_bits - bit_array.read_offset) / 11) * 2);
                if (payload_length > max_payload_length) {
                    length_area.value_details.desc = "payload length is too large (max allowed: " + max_payload_length + ")";
                    length_area.value_details.valid = false;
                }

                for (var j = 0; j < Math.floor(payload_length / 2); j++) {
                    var [two_chars, alphanum_area] = read_int_and_add_row(bit_array, 11, "two_chars", [255, 255, 192]);
                    var char2_code = alphanum_area.value_details.value % 45;
                    var char1_code = (alphanum_area.value_details.value - char2_code) / 45;
                    alphanum_area.value_details.desc = char1_code + "=" + alphanumeric_table.get(char1_code) + "; " + char2_code + "=" + alphanumeric_table.get(char2_code);
                    alphanum_area.value_details.text_payload = alphanumeric_table.get(char1_code) + alphanumeric_table.get(char2_code);
                }
                if (payload_length % 2 != 0) {
                    // read additional character
                    var [final_char, alphanum_area] = read_int_and_add_row(bit_array, 6, "final_char", [255, 255, 192]);
                    alphanum_area.value_details.desc = alphanum_area.value_details.value + "=" + alphanumeric_table.get(alphanum_area.value_details.value);
                    alphanum_area.value_details.text_payload = alphanumeric_table.get(alphanum_area.value_details.value);
                }
                break;
            } else if (mode == 0b0100) {
                // Byte encoding
                var [payload_length, length_area] = read_int_and_add_row(bit_array, 8, "payload_length", [255, 192, 255]);
                const max_payload_length = Math.floor((num_data_bits - bit_array.read_offset) / 8);
                if (payload_length > max_payload_length) {
                    length_area.value_details.desc = "payload length is too large (max allowed: " + max_payload_length + ")";
                    length_area.value_details.valid = false;
                }

                for (var j = 0; j < payload_length; j++) {
                    var [byte, byte_area] = read_int_and_add_row(bit_array, 8, "byte", [255, 255, 192]);
                    byte_area.value_details.desc = "ASCII='" + String.fromCharCode(byte_area.value_details.value) + "'";
                    byte_area.value_details.text_payload = String.fromCharCode(byte_area.value_details.value);
                }
                break;
            } else if (mode == 0b0111) {
                // ECI marker
                var [eci_marker, eci_area] = read_int_and_add_row(bit_array, 8, "eci_marker", [192, 255, 255]);
                if (eci_area.value_details.value == 26) {
                    eci_area.value_details.desc = "UTF-8 charset";
                    eci_area.value_details.valid = true;
                } else {
                    eci_area.value_details.desc = "Unsupported ECI marker \"" + eci_area.value_details.value + "\"";
                    eci_area.value_details.valid = false;
                }

            } else {
                // Unsupported mode
                break;
            }
        }

        if (bit_array.read_offset < num_data_bits - 4) {
            var [mode, terminator_area] = read_int_and_add_row(bit_array, 4, "terminator", [255, 0, 0]);
            if (terminator_area.value_details.value == 0) {
                terminator_area.value_details.desc = mode_names.get(terminator_area.value_details.value);
                terminator_area.value_details.valid = true;
            } else {
                terminator_area.value_details.desc = "Unsupported mode \"" + terminator_area.value_details.value + "\" (terminator expected)";
                terminator_area.value_details.valid = false;
                terminator_area.value_details.replacements = [];
                for (var i = 0; i < 4; i++) {
                    const mask = 1 << (3 - i);
                    if (terminator_area.value_details.value & mask) {
                        const [x, y] = terminator_area.regions.pixel_coords_at_bit_offset(i);
                        const current_value = decoder.pixel_data.get(x, y);
                        terminator_area.value_details.replacements.push({"x": x, "y": y, "value": !current_value});
                    }
                }
            }
        }
        if (bit_array.read_offset % 8 != 0) {
            const num_bits_missing_for_byte = 8 - (bit_array.read_offset % 8);
            var [mode, padding_area] = read_int_and_add_row(bit_array, num_bits_missing_for_byte, "padding", [255, 255, 192]);
            padding_area.value_details.desc = "Padding Bits";
            if (padding_area.value_details.value == 0) {
                padding_area.value_details.valid = true;
            } else {
                padding_area.value_details.desc += " (invalid values; should be 0)";
                padding_area.value_details.valid = false;
                padding_area.value_details.replacements = [];
                for (var i = 0; i < num_bits_missing_for_byte; i++) {
                    const mask = 1 << (num_bits_missing_for_byte - i - 1);
                    if (padding_area.value_details.value & mask) {
                        const [x, y] = padding_area.regions.pixel_coords_at_bit_offset(i);
                        const current_value = decoder.pixel_data.get(x, y);
                        padding_area.value_details.replacements.push({"x": x, "y": y, "value": !current_value});
                    }
                }
            }
        }
        const valid_padding_values = [236, 17];
        var padding_value_index = 0;
        while (bit_array.read_offset < num_data_bits) {
            let expected_padding_value = valid_padding_values[padding_value_index];
            padding_value_index++;
            padding_value_index %= 2;
            const pad_length = Math.min(num_data_bits - bit_array.read_offset, 8);

            var [mode, padding_area] = read_int_and_add_row(bit_array, pad_length, "padding", [255, 255, 192]);
            padding_area.value_details.desc = "Padding Byte";
            if (padding_area.value_details.value == expected_padding_value) {
                padding_area.value_details.valid = true;
            } else {
                padding_area.value_details.desc += " (invalid value; should be " + expected_padding_value + ")";
                padding_area.value_details.valid = false;
                padding_area.value_details.replacements = [];
                for (var i = 0; i < pad_length; i++) {
                    const mask = 1 << (pad_length - i - 1);
                    if ((padding_area.value_details.value & mask) != (expected_padding_value & mask)) {
                        const [x, y] = padding_area.regions.pixel_coords_at_bit_offset(i);
                        const current_value = decoder.pixel_data.get(x, y);
                        padding_area.value_details.replacements.push({"x": x, "y": y, "value": !current_value});
                    }
                }
            }
        }
    } catch (ex) {
        error_list.push({"desc": "Note: decoding failed (\"" + ex + "\"); decoding was aborted."});
    }

    return [new_dynamic_areas, error_list];
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

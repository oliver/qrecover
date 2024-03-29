//
// Functions for decoding QR code pixel data
//


class FormatSpecifications {
    static #error_correction_levels = {
        // TODO: this table should also take the size of the QR code into account.
        // Currently this value is only correct for a version-2 code (25x25 pixels)!
        2: { "data_bytes": 16, "ec_bytes": 28, "desc": "H / High" },
        3: { "data_bytes": 22, "ec_bytes": 22, "desc": "Q / Quartile" },
        0: { "data_bytes": 28, "ec_bytes": 16, "desc": "M / Medium" },
        1: { "data_bytes": 34, "ec_bytes": 10, "desc": "L / Low" }
    };

    static get_ec_level_details (ec_level) {
        return this.#error_correction_levels[ec_level];
    }
}


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
    unknown_pixels; /// stores which pixels are marked as "unknown" by the user
    static_areas;
    dynamic_areas;
    error_list = new Array();

    constructor (code_size) {
        this.code_size = code_size;
        this.pixel_data = new PixelData(this.code_size);
        this.unknown_pixels = new PixelData(this.code_size);
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

    get_ec_data() {
        const pixel_decoder = new PixelDecoder(code_size, this.get_masked_pixels(), this.static_areas);
        const bit_array = pixel_decoder.get_bit_array();
        const ec_level = this.static_areas.get("format_ec_1").value_details.value;
        const ec_level_details = FormatSpecifications.get_ec_level_details(ec_level);
        var data_bytes = new Array();
        var ec_bytes = new Array();
        for (var i = 0; i < ec_level_details.data_bytes; i++) {
            data_bytes.push(bit_array.read_next_int(8));
        }
        for (var i = 0; i < ec_level_details.ec_bytes; i++) {
            ec_bytes.push(bit_array.read_next_int(8));
        }

        var unknown_bytes_flags = new Array();
        const unknown_pixels_decoder = new PixelDecoder(code_size, this.unknown_pixels, this.static_areas);
        const unknown_bit_array = unknown_pixels_decoder.get_bit_array();
        for (var i = 0; i < ec_level_details.data_bytes + ec_level_details.ec_bytes; i++) {
            const byte_has_unknown_pixels = (unknown_bit_array.read_next_int(8) != 0);
            unknown_bytes_flags.push(byte_has_unknown_pixels);
        }

        return [data_bytes, ec_bytes, unknown_bytes_flags];
    }

    decode () {
        this.error_list.length = 0;
        this.static_areas = add_static_areas(this);

        var errors_from_dynamic_areas;
        [this.dynamic_areas, errors_from_dynamic_areas] = add_dynamic_areas(this);
        this.error_list = this.error_list.concat(errors_from_dynamic_areas);

        const errors_from_global_checks = perform_global_checks(this);
        this.error_list = this.error_list.concat(errors_from_global_checks);

        return this.get_ec_data();
    }
}


function generate_replacements (decoder, area, num_bits, valid_values, current_value) {
    var replacement_candidates = [];
    for (const [replacement_value, replacement_desc] of valid_values) {
        const distance = hamming_weight(replacement_value ^ current_value);
        var replacement_entry = {
            "value": replacement_value,
            "distance": distance,
            "desc": replacement_desc + " (" + distance + " bit(s) changed)",
            "replacements": []
        }

        for (var i = 0; i < num_bits; i++) {
            const [x, y] = area.regions.pixel_coords_at_bit_offset(i);
            const current_pixel_value = decoder.pixel_data.get(x, y);
            const mask = 1 << (num_bits - i - 1);
            var correct_pixel_value;
            if ((current_value & mask) != (replacement_value & mask)) {
                correct_pixel_value = !current_pixel_value;
            } else {
                correct_pixel_value = current_pixel_value;
            }
            replacement_entry["replacements"].push({"x": x, "y": y, "value": correct_pixel_value});
        }

        replacement_candidates.push(replacement_entry);
    }

    replacement_candidates.sort( (a,b) => {
        if (a.distance != b.distance) {
            return a.distance - b.distance;
        } else {
            return a.value - b.value;
        }
    });

    return replacement_candidates;
}

function add_dynamic_areas (decoder) {
    const pixel_decoder = new PixelDecoder(code_size, decoder.get_masked_pixels(), decoder.static_areas);
    const bit_array = pixel_decoder.get_bit_array();

    // decode data bits:
    var new_dynamic_areas = new AreaMap();
    var error_list = new Array();

    function read_int_and_add_row (bits, len, name, color) {
        var orig_offset = bits.read_offset;
        const int_value = bits.read_next_int(len);

        var region_coordinates = [];
        for (var i = 0; i < len; i++) {
            const pos = pixel_decoder.get_coordinates_for_bit_offset(orig_offset+i);
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

    const ec_level = decoder.static_areas.get("format_ec_1").value_details.value;
    const ec_level_details = FormatSpecifications.get_ec_level_details(ec_level);
    const num_data_bits = ec_level_details.data_bytes * 8;
    const num_ec_bits = ec_level_details.ec_bytes * 8;
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
            mode_area.value_details.replacement_candidates = generate_replacements(decoder, mode_area, mode_area.value_details.num_bits, mode_names, mode_area.value_details.value);

            if (mode == 0b0010) {
                // Alphanumeric encoding
                var [payload_length, length_area] = read_int_and_add_row(bit_array, 9, "payload_length", [255, 192, 255]);
                length_area.value_details.desc = payload_length + " characters";
                const max_payload_length = Math.floor(((num_data_bits - bit_array.read_offset) / 11) * 2);
                if (payload_length > max_payload_length) {
                    length_area.value_details.desc = "payload length is too large (max allowed: " + max_payload_length + ")";
                    length_area.value_details.valid = false;
                }
                var valid_values = new Map();
                for (var i = 0; i < max_payload_length+1; i++) {
                    valid_values.set(i, "" + i);
                }
                length_area.value_details.replacement_candidates = generate_replacements(decoder, length_area, length_area.value_details.num_bits, valid_values, payload_length);

                for (var j = 0; j < Math.floor(payload_length / 2); j++) {
                    var [two_chars, alphanum_area] = read_int_and_add_row(bit_array, 11, "two_chars", [255, 255, 192]);
                    var char2_code = alphanum_area.value_details.value % 45;
                    var char1_code = (alphanum_area.value_details.value - char2_code) / 45;
                    alphanum_area.value_details.desc = char1_code + "=" + alphanumeric_table.get(char1_code) + "; " + char2_code + "=" + alphanumeric_table.get(char2_code);
                    alphanum_area.value_details.text_payload = alphanumeric_table.get(char1_code) + alphanumeric_table.get(char2_code);

                    /*var valid_values = new Map();
                    for (var i = 0; i < 2**11; i++) {
                        const char2_code = i % 45;
                        const char1_code = (i - char2_code) / 45;
                        valid_values.set(i, "" + i + " (" + alphanumeric_table.get(char1_code) + " / " + alphanumeric_table.get(char2_code) + ")");
                    }
                    alphanum_area.value_details.replacement_candidates = generate_replacements(decoder, alphanum_area, alphanum_area.value_details.num_bits, valid_values, alphanum_area.value_details.value);*/
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
                length_area.value_details.desc = payload_length + " bytes";
                const max_payload_length = Math.floor((num_data_bits - bit_array.read_offset) / 8);
                if (payload_length > max_payload_length) {
                    length_area.value_details.desc = "payload length is too large (max allowed: " + max_payload_length + ")";
                    length_area.value_details.valid = false;
                }
                var valid_values = new Map();
                for (var i = 0; i < max_payload_length+1; i++) {
                    valid_values.set(i, "" + i);
                }
                length_area.value_details.replacement_candidates = generate_replacements(decoder, length_area, length_area.value_details.num_bits, valid_values, payload_length);

                for (var j = 0; j < payload_length; j++) {
                    var [byte, byte_area] = read_int_and_add_row(bit_array, 8, "byte", [255, 255, 192]);
                    byte_area.value_details.desc = "ASCII='" + String.fromCharCode(byte_area.value_details.value) + "'";
                    byte_area.value_details.text_payload = String.fromCharCode(byte_area.value_details.value);

                    var valid_values = new Map();
                    for (var i = 0; i < 256; i++) {
                        var printable_char;
                        if (i < 32) {
                            printable_char = "&#" + (0x2400+i) + ";";
                        } else {
                            printable_char = String.fromCharCode(i);
                        }
                        valid_values.set(i, "" + i + " (" + printable_char + ")");
                    }
                    byte_area.value_details.replacement_candidates = generate_replacements(decoder, byte_area, byte_area.value_details.num_bits, valid_values, byte_area.value_details.value);
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
                    const [x, y] = padding_area.regions.pixel_coords_at_bit_offset(i);
                    const current_value = decoder.pixel_data.get(x, y);
                    const mask = 1 << (pad_length - i - 1);
                    var correct_value;
                    if ((padding_area.value_details.value & mask) != (expected_padding_value & mask)) {
                        correct_value = !current_value;
                    } else {
                        correct_value = current_value;
                    }
                    padding_area.value_details.replacements.push({"x": x, "y": y, "value": correct_value});
                }
            }
        }

        // EC data
        while (bit_array.read_offset < (num_data_bits + num_ec_bits)) {
            const [value, ec_area] = read_int_and_add_row(bit_array, 8, "ec_data", [0, 255, 192]);
            ec_area.value_details.desc = "Error correction byte";
        }

        // final padding bits
        if (bit_array.read_offset < bit_array.length) {
            const pad_length = bit_array.length - bit_array.read_offset;
            const [value, padding_area] = read_int_and_add_row(bit_array, pad_length, "padding", [255, 255, 192]);
            padding_area.value_details.desc = "Final Padding Bits";
            if (padding_area.value_details.value == 0) {
                padding_area.value_details.valid = true;
            } else {
                padding_area.value_details.desc += " (invalid values; should be 0)";
                padding_area.value_details.valid = false;
            }
        }

        if (bit_array.length != bit_array.read_offset) {
            throw "internal error: there are unprocessed bits at the end of decoding (total length: " + bit_array.length + "; processed: " + bit_array.read_offset + ")";
        }
    } catch (ex) {
        error_list.push({"desc": "Note: decoding failed (\"" + ex + "\"); decoding was aborted."});
    }

    return [new_dynamic_areas, error_list];
}

//
// Functions for adding and working with the "static" areas of the QR code (ie. the areas that don't change position/size)
//


function bits_to_int (bool_array) {
    var int_result = 0;
    for (bool_value of bool_array) {
        int_result <<= 1;
        int_result |= (bool_value ? 1 : 0);
    }
    return int_result;
}

function expect_pixels (regions, expected_values) {
    const bool_array = pixel_data.get_pixels_from_regions_as_bools(regions);
    if (expected_values.length != bool_array.length) {
        throw {"desc":"internal error: bad expected size"};
    }
    for (var i = 0; i < bool_array.length; i++) {
        const expected_value = (expected_values[i] == "x" ? true : false);
        if (bool_array[i] != expected_value) {
            const [x, y] = RegionList.from_raw_objects(regions).pixel_coords_at_bit_offset(i);
            throw {
                "x": x,
                "y": y
            };

        }
    }
}

function add_static_areas () {
    // three position markers:
    add_area("pos_ul", [[0, 0, 7, 7]], [0, 255, 0], function (area) {
        expect_pixels(area.regions,
            "xxxxxxx" +
            "x.....x" +
            "x.xxx.x" +
            "x.xxx.x" +
            "x.xxx.x" +
            "x.....x" +
            "xxxxxxx"
        );
        return {"valid": true};
    });
    add_area("pos_ur", [[code_size-7, 0, 7, 7]], [0, 255, 0], static_areas.get("pos_ul").check_function);
    add_area("pos_bl", [[0, code_size-7, 7, 7]], [0, 255, 0], static_areas.get("pos_ul").check_function);

    // one orientation marker (bottom right):
    add_area("orient", [[16, 16, 5, 5]], [0, 255, 0], function (area) {
        expect_pixels(area.regions,
            "xxxxx" +
            "x...x" +
            "x.x.x" +
            "x...x" +
            "xxxxx"
        );
        return {"valid": true};
    });

    // spacers around all position markers:
    add_area("spacing_ul_1", [[0, 7, 8, 1], [7, 0, 1, 7]], [192, 255, 128], function (area) {
        expect_pixels(area.regions, "........" + ".......");
        return {"valid": true};
    });
    add_area("spacing_ur_1", [[code_size-8, 0, 1, 7], [code_size-8, 7, 8, 1]], [192, 255, 128], static_areas.get("spacing_ul_1").check_function);
    add_area("spacing_bl_1", [[0, code_size-8, 8, 1], [7, code_size-7, 1, 7]], [192, 255, 128], static_areas.get("spacing_ul_1").check_function);

    // two timing strips:
    add_area("timing_top", [[8, 6, 9, 1]], [0, 0, 255], function (area) {
        expect_pixels(area.regions, "x.x.x.x.x");
        return {"valid": true};
    });
    add_area("timing_left", [[6, 8, 1, 9]], [0, 0, 255], static_areas.get("timing_top").check_function);

    // error correction level (redundantly):
    add_area("format_ec_1", [[0, 8, 2, 1]], [255, 128, 0], function (area) {
        const [bit0, bit1] = pixel_data.get_pixels_as_bools(area.regions[0]);
        const ec_level = bits_to_int([bit0, bit1]) ^ 0b10;
        return {"value": ec_level, "num_bits": 2, "desc": "EC Level: " + ec_level + " (" + error_correction_levels[ec_level] + ")"};
    });
    add_area("format_ec_2", [[8, code_size-1, 1, 1], [8, code_size-2, 1, 1]], [255, 128, 0], function (area) {
        const bits = pixel_data.get_pixels_from_regions_as_bools(area.regions);
        const ec_level = bits_to_int(bits) ^ 0b10;

        const ec_1_value = static_areas.get("format_ec_1").check_function(static_areas.get("format_ec_1")).value;
        var valid = true;
        var desc_text = "EC Level: " + ec_level + " (" + error_correction_levels[ec_level] + ")";
        if (ec_1_value != ec_level) {
            valid = false;
            desc_text += "; error: value doesn't match \"format_ec_1\" value";
        }
        // TODO: also perform this validity check in format_ec_1 itself.
        // But to avoid infinite recursion, I guess the best solution would be to split part of the check_function() into a new value_function(),
        // which can just return the value and num_bits, but does not perform own validity checks.

        return {"value": ec_level, "num_bits": 2, "desc": desc_text, "valid": valid};
    });

    // mask pattern (redundantly):
    add_area("format_mask_1", [[2, 8, 3, 1]], [128, 255, 0], function (area) {
        const [bit0, bit1, bit2] = pixel_data.get_pixels_as_bools(area.regions[0]);
        const mask_value = bits_to_int([bit0, bit1, bit2]) ^ 0b101;
        return {
            "desc": "Mask: " + mask_value + " (0b" + mask_value.toString(2) + ")",
            "num_bits": 3,
            "value": mask_value
        };
    });
    add_area("format_mask_2", [[8, code_size-3, 1, 1], [8, code_size-4, 1, 1], [8, code_size-5, 1, 1]], [128, 255, 0], function (area) {
        const bits = pixel_data.get_pixels_from_regions_as_bools(area.regions);
        const mask_value = bits_to_int(bits) ^ 0b101;

        const mask_1_value = static_areas.get("format_mask_1").check_function(static_areas.get("format_mask_1")).value;
        var valid = true;
        var desc_text = "Mask: " + mask_value + " (0b" + mask_value.toString(2) + ")";
        if (mask_1_value != mask_value) {
            valid = false;
            desc_text += "; error: value doesn't match \"format_mask_1\" value";
        }
        // TODO: also perform this validity check in format_mask_1 itself.

        return {
            "desc": desc_text,
            "valid": valid,
            "num_bits": 3,
            "value": mask_value
        };
    });

    function do_complete_format_ec_check (area, format_ec_area_id, format_mask_area_id) {
        const value = bits_to_int(get_masked_pixels().get_pixels_from_regions_as_bools(area.regions));

        var result = {
            "num_bits": area.num_pixels,
            "value": value
        };

        const ec_value = static_areas.get(format_ec_area_id).check_function(static_areas.get(format_ec_area_id)).value;
        const mask_value = static_areas.get(format_mask_area_id).check_function(static_areas.get(format_mask_area_id)).value;
        const full_ec_bits = (ec_value << 13) | (mask_value << 10) | value;

        const check_result = check_format_ec(full_ec_bits);

        if (check_result != 0) {
            result["valid"] = false;
            result["desc"] = "checksum does not match content";
        }

        return result;
    }

    // error correction values for format and mask (currently only added so that the data bits are read correctly):
    add_area("format_ec_data_1", [
            [5, 8, 1, 1], [7, 8, 2, 1], [8, 7, 1, 1],
            // list these regions separately, to get correct order of bits:
            [8, 5, 1, 1], [8, 4, 1, 1], [8, 3, 1, 1], [8, 2, 1, 1], [8, 1, 1, 1], [8, 0, 1, 1]
        ], [192, 128, 128], function(area) {
        return do_complete_format_ec_check(area, "format_ec_1", "format_mask_1");
    });

    add_area("format_ec_data_2", [[8, code_size-6, 1, 1], [8, code_size-7, 1, 1], [code_size-8, 8, 8, 1]], [192, 128, 128], function(area) {
        // TODO: also check that format_ec_data_1 has the same value?
        return do_complete_format_ec_check(area, "format_ec_2", "format_mask_2");
    });

    add_area("dark_module", [[8, code_size-8, 1, 1]], [128, 128, 192], function(area) {
        expect_pixels(area.regions, "x");
        return {"valid": true};
    });
}

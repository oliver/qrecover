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

function expect_pixels (decoder, region_list, expected_values) {
    const bool_array = decoder.pixel_data.get_pixels_from_regions_as_bools(region_list);
    if (expected_values.length != bool_array.length) {
        return {"valid": false, "desc": "internal error: bad expected size"};
    }

    var details = {
        "valid": true,
        "desc": "",
        "replacements": []
    };
    for (var i = 0; i < bool_array.length; i++) {
        const expected_value = (expected_values[i] == "x" ? true : false);
        const [x, y] = region_list.pixel_coords_at_bit_offset(i);
        details.replacements.push({"x": x, "y": y, "value": expected_value});
        if (bool_array[i] != expected_value) {
            details.valid = false;
            details.desc = "Invalid Pixel(s)";
        }
    }
    if (details.valid) {
        details.replacements = [];
    }

    return details
}

function add_static_areas (decoder) {
    var new_static_areas = new AreaMap();

    // three position markers:
    new_static_areas.add_area(new Area("pos_ul", RegionList.from_nested_arrays([[0, 0, 7, 7]]), [0, 255, 0]));
    new_static_areas.add_area(new Area("pos_ur", RegionList.from_nested_arrays([[code_size-7, 0, 7, 7]]), [0, 255, 0]));
    new_static_areas.add_area(new Area("pos_bl", RegionList.from_nested_arrays([[0, code_size-7, 7, 7]]), [0, 255, 0]));

    for (const area_id of ["pos_ul", "pos_ur", "pos_bl"]) {
        const area = new_static_areas.get(area_id);
        area.value_details = expect_pixels(decoder, area.regions,
            "xxxxxxx" +
            "x.....x" +
            "x.xxx.x" +
            "x.xxx.x" +
            "x.xxx.x" +
            "x.....x" +
            "xxxxxxx"
        );
    }

    // one orientation marker (bottom right):
    new_static_areas.add_area(new Area("orient", RegionList.from_nested_arrays([[16, 16, 5, 5]]), [0, 255, 0]));
    new_static_areas.get("orient").value_details = expect_pixels(decoder, new_static_areas.get("orient").regions,
        "xxxxx" +
        "x...x" +
        "x.x.x" +
        "x...x" +
        "xxxxx"
    );

    // spacers around all position markers:
    new_static_areas.add_area(new Area("spacing_ul_1", RegionList.from_nested_arrays([[0, 7, 8, 1], [7, 0, 1, 7]]), [192, 255, 128]));
    new_static_areas.add_area(new Area("spacing_ur_1", RegionList.from_nested_arrays([[code_size-8, 0, 1, 7], [code_size-8, 7, 8, 1]]), [192, 255, 128]));
    new_static_areas.add_area(new Area("spacing_bl_1", RegionList.from_nested_arrays([[0, code_size-8, 8, 1], [7, code_size-7, 1, 7]]), [192, 255, 128]));

    for (const area_id of ["spacing_ul_1", "spacing_ur_1", "spacing_bl_1"]) {
        const area = new_static_areas.get(area_id);
        area.value_details = expect_pixels(decoder, area.regions, "........" + ".......");
    }

    // two timing strips:
    const timing_top_area = new Area("timing_top", RegionList.from_nested_arrays([[8, 6, 9, 1]]), [0, 0, 255]);
    timing_top_area.value_details = expect_pixels(decoder, timing_top_area.regions, "x.x.x.x.x");
    new_static_areas.add_area(timing_top_area);

    const timing_left_area = new Area("timing_left", RegionList.from_nested_arrays([[6, 8, 1, 9]]), [0, 0, 255])
    timing_left_area.value_details = expect_pixels(decoder, timing_left_area.regions, "x.x.x.x.x");
    new_static_areas.add_area(timing_left_area);

    // error correction level (redundantly):
    const format_ec_1_area = new Area("format_ec_1", RegionList.from_nested_arrays([[0, 8, 2, 1]]), [255, 128, 0]);
    new_static_areas.add_area(format_ec_1_area);
    const format_ec_1_level = bits_to_int(decoder.pixel_data.get_pixels_from_regions_as_bools(format_ec_1_area.regions)) ^ 0b10;
    format_ec_1_area.value_details = {"value": format_ec_1_level, "num_bits": 2, "desc": "EC Level: " + format_ec_1_level + " (" + FormatSpecifications.get_ec_level_details(format_ec_1_level).desc + ")"};

    const format_ec_2_area = new Area("format_ec_2", RegionList.from_nested_arrays([[8, code_size-1, 1, 1], [8, code_size-2, 1, 1]]), [255, 128, 0]);
    new_static_areas.add_area(format_ec_2_area);
    const format_ec_2_level = bits_to_int(decoder.pixel_data.get_pixels_from_regions_as_bools(format_ec_2_area.regions)) ^ 0b10;
    format_ec_2_area.value_details = {
        "value": format_ec_2_level,
        "num_bits": 2,
        "desc": "EC Level: " + format_ec_2_level + " (" + FormatSpecifications.get_ec_level_details(format_ec_2_level).desc + ")",
        "valid": true
    };
    if (format_ec_1_level != format_ec_2_level) {
        format_ec_2_area.value_details.valid = false;
        format_ec_2_area.value_details.desc += "; error: value doesn't match \"format_ec_1\" value";
    }
    // TODO: also perform this validity check in format_ec_1 itself.
    // But to avoid infinite recursion, I guess the best solution would be to split part of the check_function() into a new value_function(),
    // which can just return the value and num_bits, but does not perform own validity checks.

    // mask pattern (redundantly):
    const format_mask_1_area = new Area("format_mask_1", RegionList.from_nested_arrays([[2, 8, 3, 1]]), [128, 255, 0]);
    new_static_areas.add_area(format_mask_1_area);
    const format_mask_1_value = bits_to_int(decoder.pixel_data.get_pixels_from_regions_as_bools(format_mask_1_area.regions)) ^ 0b101;
    format_mask_1_area.value_details = {
        "desc": "Mask: " + format_mask_1_value + " (0b" + format_mask_1_value.toString(2) + ")",
        "num_bits": 3,
        "value": format_mask_1_value
    };

    const format_mask_2_area = new Area("format_mask_2", RegionList.from_nested_arrays([[8, code_size-3, 1, 1], [8, code_size-4, 1, 1], [8, code_size-5, 1, 1]]), [128, 255, 0]);
    new_static_areas.add_area(format_mask_2_area);
    const format_mask_2_value = bits_to_int(decoder.pixel_data.get_pixels_from_regions_as_bools(format_mask_2_area.regions)) ^ 0b101;
    format_mask_2_area.value_details = {
        "desc": "Mask: " + format_mask_2_value + " (0b" + format_mask_2_value.toString(2) + ")",
        "valid": true,
        "num_bits": 3,
        "value": format_mask_2_value
    };
    if (format_mask_1_value != format_mask_2_value) {
        format_mask_2_area.value_details.valid = false;
        format_mask_2_area.value_details.desc += "; error: value doesn't match \"format_mask_1\" value";
    }
    // TODO: also perform this validity check in format_mask_1 itself.

    function do_complete_format_ec_check (area, format_ec_area_id, format_mask_area_id) {
        const value = bits_to_int(decoder.pixel_data.get_pixels_from_regions_as_bools(area.regions)) ^ 0b0000010010;

        var result = {
            "num_bits": area.num_pixels,
            "value": value
        };

        const ec_value = new_static_areas.get(format_ec_area_id).value_details.value;
        const mask_value = new_static_areas.get(format_mask_area_id).value_details.value;
        const full_ec_bits = (ec_value << 13) | (mask_value << 10) | value;

        const check_result = check_format_ec(full_ec_bits);

        if (check_result != 0) {
            result["valid"] = false;
            result["desc"] = "checksum does not match content";
        }

        return result;
    }

    // error correction values for format and mask
    const format_ec_data_1_area = new Area("format_ec_data_1", RegionList.from_nested_arrays([
            [5, 8, 1, 1], [7, 8, 2, 1], [8, 7, 1, 1],
            // list these regions separately, to get correct order of bits:
            [8, 5, 1, 1], [8, 4, 1, 1], [8, 3, 1, 1], [8, 2, 1, 1], [8, 1, 1, 1], [8, 0, 1, 1]
        ]), [192, 128, 128]);
    new_static_areas.add_area(format_ec_data_1_area);
    format_ec_data_1_area.value_details = do_complete_format_ec_check(format_ec_data_1_area, "format_ec_1", "format_mask_1");

    const format_ec_data_2_area = new Area("format_ec_data_2", RegionList.from_nested_arrays([[8, code_size-6, 1, 1], [8, code_size-7, 1, 1], [code_size-8, 8, 8, 1]]), [192, 128, 128]);
    new_static_areas.add_area(format_ec_data_2_area);
    format_ec_data_2_area.value_details = do_complete_format_ec_check(format_ec_data_2_area, "format_ec_2", "format_mask_2");

    const dark_module_area = new Area("dark_module", RegionList.from_nested_arrays([[8, code_size-8, 1, 1]]), [128, 128, 192]);
    new_static_areas.add_area(dark_module_area);
    dark_module_area.value_details = expect_pixels(decoder, dark_module_area.regions, "x");

    return new_static_areas;
}

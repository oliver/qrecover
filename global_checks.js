//
// Functions for checking correctness of the decoded data, taking all areas into account
//

function perform_global_checks (decoder) {
    var error_list = new Array();
    error_list = error_list.concat(perform_format_ec_check(decoder));
    error_list = error_list.concat(perform_data_ec_check(decoder));
    return error_list;
}

function perform_format_ec_check (decoder) {
    var error_list = new Array();

    const ec_1_value = decoder.static_areas.get("format_ec_1").value_details.value;
    const mask_1_value = decoder.static_areas.get("format_mask_1").value_details.value;
    const ec_data_1_value = decoder.static_areas.get("format_ec_data_1").value_details.value;
    const full_ec_1_bits = (ec_1_value << 13) | (mask_1_value << 10) | ec_data_1_value;
    const check_result_1 = check_format_ec(full_ec_1_bits);

    const ec_2_value = decoder.static_areas.get("format_ec_2").value_details.value;
    const mask_2_value = decoder.static_areas.get("format_mask_2").value_details.value;
    const ec_data_2_value = decoder.static_areas.get("format_ec_data_2").value_details.value;
    const full_ec_2_bits = (ec_2_value << 13) | (mask_2_value << 10) | ec_data_2_value;
    const check_result_2 = check_format_ec(full_ec_2_bits);

    if (check_result_1 != 0 || check_result_2 != 0) {
        var error_entry = {
            "desc": "Format data has invalid checksum",
            "potential_corrections": []
        };

        const potential_corrections_1 = get_corrections(full_ec_1_bits);
        const potential_corrections_2 = get_corrections(full_ec_2_bits);

        // create list of best corrections, taking both format info sections into account:
        var combined_corrections = new Array();
        for (var {code, distance} of potential_corrections_1) {
            const matching_element_in_2 = potential_corrections_2.find(element => (element.code == code));
            combined_corrections.push({"code": code, "distance_sum": distance + matching_element_in_2.distance});
        }

        combined_corrections.sort((a,b) => {
            if (a.distance_sum != b.distance_sum) {
                return a.distance_sum - b.distance_sum;
            } else {
                return a.code - b.code;
            }
        });

        for (var {code, distance_sum} of combined_corrections) {
            const replacement_code = code;
            let replacements = new Array();

            const all_regions_1 = decoder.static_areas.get("format_ec_1").regions.concat(
                    decoder.static_areas.get("format_mask_1").regions).concat(
                    decoder.static_areas.get("format_ec_data_1").regions);
            const all_regions_2 = decoder.static_areas.get("format_ec_2").regions.concat(
                decoder.static_areas.get("format_mask_2").regions).concat(
                decoder.static_areas.get("format_ec_data_2").regions);
            const num_bits = 15;
            const replacement_code_masked = replacement_code ^ 0b101010000010010;
            for (var i = 0; i < num_bits; i++) {
                const bit = (replacement_code_masked >> (num_bits - i - 1)) & 1;
                const [x_1, y_1] = all_regions_1.pixel_coords_at_bit_offset(i);
                replacements.push({"x": x_1, "y": y_1, "value": bit});
                const [x_2, y_2] = all_regions_2.pixel_coords_at_bit_offset(i);
                replacements.push({"x": x_2, "y": y_2, "value": bit});
            }

            const ec_value = (replacement_code >> 13) & 0b11;
            const mask_value = (replacement_code >> 10) & 0b111;
            const payload_bits = (replacement_code >> 10) & 0b11111;

            var correction_entry = {
                "desc": payload_bits.toString(2).padStart(5,"0")
                    + " = EC: " + FormatSpecifications.get_ec_level_details(ec_value).desc + ", mask: " + mask_value
                    + " (" + distance_sum + " bit(s) differ)",
                "replacements": replacements
            };
            error_entry.potential_corrections.push(correction_entry);
        }

        error_list.push(error_entry);
    }

    return error_list;
}

function perform_data_ec_check (decoder) {
    var error_list = new Array();

    const [data_bytes, ec_bytes, unknown_bytes_flags] = decoder.get_ec_data();


    const ec_level = global_decoder_obj.static_areas.get("format_ec_1").value_details.value;
    const ec_level_details = FormatSpecifications.get_ec_level_details(ec_level);
    var rs = new ReedSolomon(ec_level_details.ec_bytes);
    const original_bytes = data_bytes.concat(ec_bytes);

    var original_bytes_with_erasures = original_bytes.slice(0);
    for (var i = 0; i < unknown_bytes_flags.length; i++) {
        if (unknown_bytes_flags[i]) {
            original_bytes_with_erasures[i] = -1; // negative values are treated as "erasures" (ie. bytes which are expected to be wrong)
        }
    }

    var corrected_bytes = "";
    try {
        corrected_bytes = rs.decode(original_bytes_with_erasures);
    } catch (ex) {
        error_list.push({"desc": "error correction for data bytes failed: " + ex});
        return error_list;
    }

    console.log("original_bytes: ", original_bytes);
    console.log("corrected_bytes: ", corrected_bytes);

    if (JSON.stringify(original_bytes) != JSON.stringify(corrected_bytes)) {
        const pixel_decoder = new PixelDecoder(code_size, decoder.pixel_data, decoder.static_areas);
        var replacements = new Array();
        for (var i = 0; i < original_bytes.length; i++) {
            if (original_bytes[i] != corrected_bytes[i]) {
                for (var j = 0; j < 8; j++) {
                    const mask = 1 << (7 - j);
                    if ((original_bytes[i] & mask) != (corrected_bytes[i] & mask)) {
                        const pos = pixel_decoder.get_coordinates_for_bit_offset(i * 8 + j);
                        const current_value = pixel_decoder.get_bit_array()[i * 8 + j];
                        replacements.push({"x": pos.x, "y": pos.y, "value": !current_value});
                    }
                }
            }
        }

        var error_entry = {
            "desc": "Data bytes have incorrect checksum",
            "potential_corrections": [{
                    "desc": "Error correction result",
                    "replacements": replacements
                }
            ]
        };
        error_list.push(error_entry);
    }

    return error_list;
}

//
// Functions for working with the per-pixel data
//


var pixel_data;

function init_pixel_data() {
    pixel_data = new Array(code_size);
    for (var i = 0; i < pixel_data.length; i++) {
        pixel_data[i] = new Array(code_size);
        pixel_data[i].fill(false);
    }
}


// @param region An object with x,y,w,h attributes
function get_pixels_as_bools (region, pixel_data_to_read = pixel_data) {
    var result_array = new Array();
    for (var y = region.y; y < region.y+region.h; y++) {
        for (var x = region.x; x < region.x+region.w; x++) {
            result_array.push(pixel_data_to_read[x][y] ? true : false);
        }
    }
    return result_array;
}

// @param regions An array of region objects, each of which can be passed to get_pixels_as_bools()
function get_pixels_from_regions_as_bools (regions, pixel_data_to_read = pixel_data) {
    var result_array = new Array();
    for (var region of regions) {
        result_array = result_array.concat(get_pixels_as_bools(region, pixel_data_to_read));
    }
    return result_array;
}


function save_state () {
    sessionStorage.setItem("pixel_data", JSON.stringify(pixel_data));
}

function restore_state () {
    try {
        if (sessionStorage.getItem("pixel_data")) {
            pixel_data = JSON.parse(sessionStorage.getItem("pixel_data"));
            return true;
        }
    } catch (ex) {
        console.log("error restoring saved pixel data (" + ex + ")");
    }
}


function get_full_mask () {
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

    var mask_value = static_areas.get("format_mask_1").check_function(static_areas.get("format_mask_1"))["value"];
    const mask_bit_function = mask_types[mask_value];

    var mask_data = new Array(code_size);
    for (var x = 0; x < code_size; x++) {
        mask_data[x] = new Array(code_size);
        for (var y = 0; y < code_size; y++) {
            // apply mask only for data areas:
            if (!inside_static_areas(x, y)) {
                mask_data[x][y] = mask_bit_function(y, x);
            }
        }
    }

    function set_pixels (pix_data, region, bool_array) {
        if (region.w * region.h != bool_array.length) {
            throw "bad bool_array size"
        }

        var i = 0;
        for (var y = region.y; y < region.y+region.h; y++) {
            for (var x = region.x; x < region.x+region.w; x++) {
                pix_data[x][y] = bool_array[i];
                i++;
            }
        }
    }

    function set_pixels_in_regions (pix_data, regions, bool_array) {
        var i = 0;
        for (var region of regions) {
            for (var y = region.y; y < region.y+region.h; y++) {
                for (var x = region.x; x < region.x+region.w; x++) {
                    pix_data[x][y] = bool_array[i];
                    i++;
                }
            }
        }
        if (i != bool_array.length) {
            throw "bad bool_array size"
        }
    }

    // 10 101 0000010010
    set_pixels(mask_data, static_areas.get("format_ec_1").regions[0], [true, false]);
    set_pixels_in_regions(mask_data, static_areas.get("format_ec_2").regions, [true, false]);

    set_pixels(mask_data, static_areas.get("format_mask_1").regions[0], [true, false, true]);
    set_pixels_in_regions(mask_data, static_areas.get("format_mask_2").regions, [true, false, true]);

    set_pixels_in_regions(mask_data, static_areas.get("format_ec_data_1").regions, [false, false, false, false, false, true, false, false, true, false]);
    set_pixels_in_regions(mask_data, static_areas.get("format_ec_data_2").regions, [false, false, false, false, false, true, false, false, true, false]);

    return mask_data;
}

function get_masked_pixels () {
    var mask_data = get_full_mask();
    var masked_pixel_data = new Array(code_size);
    for (var x = 0; x < code_size; x++) {
        masked_pixel_data[x] = new Array(code_size);
        for (var y = 0; y < code_size; y++) {
            masked_pixel_data[x][y] = pixel_data[x][y] ^ mask_data[x][y];
        }
    }
    return masked_pixel_data;
}

function pixel_at_bit_offset (regions, offset) {
    for (var region of regions) {
        if (offset >= (region.w * region.h)) {
            offset -= (region.w * region.h);
            continue;
        }

        const x = offset % region.w;
        const y = Math.floor(offset / region.w);
        return [region.x + x, region.y + y];
    }
    throw "offset " + offset + " is too large";
}

function toggle_pixel (px, py) {
    var set_pixel = !(pixel_data[px][py]);
    pixel_data[px][py] = set_pixel;
    decode();
    draw_code();
}

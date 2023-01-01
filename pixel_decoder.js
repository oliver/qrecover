//
// PixelDecoder class
//


/// Decodes pixel data into a BitArray.
class PixelDecoder {
    bit_array = null;
    bit_offset_to_pixel_position = null;

    constructor (code_size, pixel_data, static_areas) {
        var curr_x = code_size-1;
        var curr_y = code_size-1;
        var end_reached = false;
        this.bit_array = new BitArray();
        this.bit_offset_to_pixel_position = new Array();
        do {
            var bit_set = pixel_data.get(curr_x, curr_y);
            this.bit_array.push(bit_set);
            this.bit_offset_to_pixel_position.push({"x":curr_x, "y":curr_y});
            [curr_x, curr_y, end_reached] = next_data_pixel_pos(static_areas, curr_x, curr_y);
        } while (!end_reached);
    }

    get_bit_array () {
        return this.bit_array;
    }

    /// Returns the x/y coordinates of the pixel for the specified offset in the bit array.
    get_coordinates_for_bit_offset (offset) {
        return this.bit_offset_to_pixel_position[offset];
    }
}


// Returns the actual next data pixel position (taking static areas into account)
function next_data_pixel_pos (static_areas, x, y) {
    // simply skip over positions that are inside an area:
    do {
        [x, y, end_reached] = next_position_in_grid(x, y);
        if (end_reached) {
            return [undefined, undefined, true];
        }
    } while (static_areas.is_inside(x, y));
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

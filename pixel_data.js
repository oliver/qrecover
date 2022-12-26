//
// Functions for working with the per-pixel data
//

/// The global PixelData object which holds the currently displayed pixel data.
var pixel_data;


/// Represents a rectangular region in a pixel grid, consisting of an x/y coordinate and a width and height.
class Region {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    for_each_pixel(func) {
        for (var y = this.y; y < this.y+this.h; y++) {
            for (var x = this.x; x < this.x+this.w; x++) {
                func(x, y);
            }
        }
    }
}

/// Represents a list of Region objects.
class RegionList {
    constructor() {
        this.regions = new Array();
    }

    /// Returns a new RegionList object, created from a nested array of region coordinates.
    /// @param array_of_arrays Array of 4-element arrays; the inner arrays specify [x, y, width, height] of each region.
    static from_nested_arrays(array_of_arrays) {
        var new_regionlist = new RegionList();
        for (var arr of array_of_arrays) {
            new_regionlist.regions.push(new Region(arr[0], arr[1], arr[2], arr[3]))
        }
        return new_regionlist;
    }

    /// Returns a new RegionList containing the regions from this list and from other_regionlist.
    concat (other_regionlist) {
        var new_regionlist = new RegionList();
        new_regionlist.regions = this.regions.concat(other_regionlist.regions);
        return new_regionlist;
    }

    for_each_pixel(func) {
        for (var region of this.regions) {
            region.for_each_pixel(func);
        }
    }

    /// Returns the x/y coordinates for the specified offset in the list of regions
    pixel_coords_at_bit_offset (offset) {
        for (var region of this.regions) {
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
}


class PixelData {
    constructor(code_size) {
        this.data_array = new Array(code_size);
        for (var i = 0; i < this.data_array.length; i++) {
            this.data_array[i] = new Array(code_size);
            this.data_array[i].fill(false);
        }
    }

    get(x, y) {
        return this.data_array[x][y];
    }
    set(x, y, new_value) {
        this.data_array[x][y] = new_value;
    }

    // @param region_list A RegionList object
    get_pixels_from_regions_as_bools (region_list) {
        var result_array = new Array();
        region_list.for_each_pixel((x, y) => {
            result_array.push(this.get(x, y));
        });
        return result_array;
    }

    set_pixels_in_regions (region_list, bool_array) {
        var i = 0;
        region_list.for_each_pixel((x, y) => {
            this.set(x, y, bool_array[i]);
            i++;
        });

        if (i != bool_array.length) {
            throw "bad bool_array size"
        }
    }
}


function save_state () {
    sessionStorage.setItem("pixel_data", JSON.stringify(pixel_data.data_array));
}

function restore_state () {
    try {
        if (sessionStorage.getItem("pixel_data")) {
            pixel_data.data_array = JSON.parse(sessionStorage.getItem("pixel_data"));
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

    var mask_data = new PixelData(code_size);
    for (var x = 0; x < code_size; x++) {
        for (var y = 0; y < code_size; y++) {
            // apply mask only for data areas:
            if (!static_areas.is_inside(x, y)) {
                mask_data.set(x, y, mask_bit_function(y, x));
            }
        }
    }

    // 10 101 0000010010
    mask_data.set_pixels_in_regions(static_areas.get("format_ec_1").regions, [true, false]);
    mask_data.set_pixels_in_regions(static_areas.get("format_ec_2").regions, [true, false]);

    mask_data.set_pixels_in_regions(static_areas.get("format_mask_1").regions, [true, false, true]);
    mask_data.set_pixels_in_regions(static_areas.get("format_mask_2").regions, [true, false, true]);

    mask_data.set_pixels_in_regions(static_areas.get("format_ec_data_1").regions, [false, false, false, false, false, true, false, false, true, false]);
    mask_data.set_pixels_in_regions(static_areas.get("format_ec_data_2").regions, [false, false, false, false, false, true, false, false, true, false]);

    return mask_data;
}

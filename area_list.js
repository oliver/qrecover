//
// Functions for working with areas and lists of areas
//

class Area {
    id;
    regions;
    color;
    check_function;

    num_pixels = 0;
    outline;
    dom_elements = new Map();

    constructor (id, region_list, color_values, check_function) {
        this.id = id;
        this.regions = region_list;
        this.color = color_values;
        this.check_function = check_function;

        for (const region of this.regions.regions) {
            this.num_pixels += region.w * region.h;
        }

        this.outline = calc_outline(this.regions);
    }

    is_inside (x, y) {
        for (const region of this.regions.regions) {
            if (x >= region.x && x < region.x+region.w &&
                y >= region.y && y < region.y+region.h) {
                return true;
            }
        }
        return false;
    }
}


class AreaMap extends Map {
    // performance optimization for is_inside(): stores for each pixel coordinate the area that contains the coordinate (or null)
    #area_grid = null;

    add_area (new_area) {
        this.set(new_area.id, new_area);
        this.#area_grid = null;
    }

    is_inside (x, y) {
        if (this.#area_grid == null) {
            this.#update_area_grid();
        }

        return this.#area_grid[x][y];
    }


    #is_inside_uncached (x, y) {
        for (const [id, area] of this.entries()) {
            if (area.is_inside(x, y)) {
                return area;
            }
        }
        return null;
    }

    #update_area_grid () {
        this.#area_grid = new Array(code_size);
        for (var x = 0; x < code_size; x++) {
            this.#area_grid[x] = new Array(code_size);
            for (var y = 0; y < code_size; y++) {
                const found_area = this.#is_inside_uncached(x, y);
                this.#area_grid[x][y] = found_area;
            }
        }
    }
}


function get_all_area_objects () {
    return new Map([... global_decoder_obj.static_areas, ... global_decoder_obj.dynamic_areas]).values();
}

// @param region_list RegionList object
// @returns A list of lines (start_x, start_y, end_x, end_y) that draw the outline of the regions
function calc_outline (region_list) {

    // Maps for single horizontal and vertical lines.
    // Each line is one cell long and goes from the smaller to the larger coordinate.
    // Key: x/y coordinate of start point (as string, to achieve correct comparison).
    // Value: integer (number of lines with that start point).
    var lines_h = new Map();
    var lines_v = new Map();

    function make_key (x, y) {
        // pad integers, to get correct comparisons when sorting lines:
        return "" + x.toString().padStart(4, "0") + "/" + y.toString().padStart(4, "0");
    }

    function parse_key (key) {
        const parts = key.split("/");
        return [parseInt(parts[0]), parseInt(parts[1])];
    }

    function increment_int_map_value (map, key) {
        if (!map.has(key)) {
            map.set(key, 0);
        }
        map.set(key, map.get(key) + 1);
    }

    // add outlines of each region to lines_h and lines_v
    for (var region of region_list.regions) {
        for (var x = 0; x < region.w; x++) {
            increment_int_map_value(lines_h, make_key(region.x + x, region.y));
            increment_int_map_value(lines_h, make_key(region.x + x, region.y + region.h));
        }
        for (var y = 0; y < region.h; y++) {
            increment_int_map_value(lines_v, make_key(region.x, region.y + y));
            increment_int_map_value(lines_v, make_key(region.x + region.w, region.y + y));
        }
    }

    // remove (set to 0) any map entries where value > 1 (if the same line exists twice, it indicates adjacent regions)
    for (const [key, num_lines] of lines_h.entries()) {
        if (num_lines < 0 || num_lines > 2) {
            console.log("internal error: unexpected number of overlapping lines");
        }
        if (num_lines == 2) {
            lines_h.set(key, 0);
        }
    }
    for (const [key, num_lines] of lines_v.entries()) {
        if (num_lines < 0 || num_lines > 2) {
            console.log("internal error: unexpected number of overlapping lines");
        }
        if (num_lines == 2) {
            lines_v.set(key, 0);
        }
    }

    lines_h = new Map([...lines_h].sort());
    lines_v = new Map([...lines_v].sort());

    // create lists of final lines from lines_h/v
    var result_lines = new Array();
    for (const [key, num_lines] of lines_h.entries()) {
        if (num_lines > 0) {
            const [x,y] = parse_key(key);
            // merge following line segments together:
            for (var i = 1; /* empty */ ; i++) {
                const next_key = make_key(x+i, y);
                if (lines_h.get(next_key) > 0) {
                    lines_h.set(next_key, 0);
                } else {
                    break;
                }
            }
            result_lines.push({"x": x, "y": y, "w": i, "h": 0 });
        }
    }
    for (const [key, num_lines] of lines_v.entries()) {
        if (num_lines > 0) {
            const [x,y] = parse_key(key);
            for (var i = 1; /* empty */ ; i++) {
                const next_key = make_key(x, y+i);
                if (lines_v.get(next_key) > 0) {
                    lines_v.set(next_key, 0);
                } else {
                    break;
                }
            }
            result_lines.push({"x": x, "y": y, "w": 0, "h": i });
        }
    }

    return result_lines;
}

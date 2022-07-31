//
// Functions for working with areas and lists of areas
//

var static_areas = new Map();
var dynamic_areas  = new Map();
var static_area_grid = null;

function add_area (id, region_list, color_values, check_function, target_map = static_areas) {
    target_map.set(id, {
        "id":id,
        "regions":[],
        "color":color_values,
        "outline:":null,
        "dom_elements": new Map(),
        "check_function":check_function
    });

    var num_pixels = 0;
    for (region of region_list) {
        target_map.get(id).regions.push({
            "x": region[0], "y": region[1], "w": region[2], "h": region[3]
        });
        num_pixels += region[2] * region[3];
    }
    target_map.get(id).num_pixels = num_pixels;

    target_map.get(id).outline = calc_outline(target_map.get(id).regions);
    return target_map.get(id);
}

function get_all_areas () {
    return new Map([...static_areas, ...dynamic_areas]);
}

function inside_area (x, y, area) {
    for (region of area.regions) {
        if (x >= region.x && x < region.x+region.w &&
            y >= region.y && y < region.y+region.h) {
            return true;
        }
    }
    return false;
}

function inside_areas (x, y, area_map) {
    for (const [id, area] of area_map.entries()) {
        if (inside_area(x, y, area)) {
            return area;
        }
    }
    return null;
}

function inside_static_areas (x, y) {
    // Performance-optimized variant of inside_areas(), which only checks against static_areas
    // and uses a precalculated lookup array.
    return static_area_grid[x][y];
}

function update_static_area_cache() {
    static_area_grid = calculate_static_area_grid();
}

function calculate_static_area_grid () {
    // create an array that stores for each pixel position the static area it is covered by (or null):
    var grid_data = new Array(code_size);
    for (var x = 0; x < code_size; x++) {
        grid_data[x] = new Array(code_size);
        for (var y = 0; y < code_size; y++) {
            const found_static_area = inside_areas(x, y, static_areas);
            grid_data[x][y] = found_static_area;
        }
    }
    return grid_data;
}

// @param regions Array of rectangular regions
// @returns A list of lines (start_x, start_y, end_x, end_y) that draw the outline of the regions
function calc_outline (regions) {

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
    for (var region of regions) {
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
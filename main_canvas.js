//
// Functions for working with the main canvas
//

var canvas, ctx;
var hovered_pixel = null;
var hatch_pattern;

function init_main_canvas (canvas_element, mouse_pos_element) {
    canvas = canvas_element;
    canvas.width = code_size*pixel_size;
    canvas.height = code_size*pixel_size;
    canvas.parentElement.style.width = "" + (code_size*pixel_size) + "px";
    canvas.style.cursor = 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" style="font-size: 20px; paint-order: stroke; stroke: white; stroke-width: 3px"><text y="20">🖉</text></svg>\') 0 20, auto';
    ctx = canvas.getContext("2d");
    hatch_pattern = ctx.createPattern(create_hatch_pattern_canvas("red", [2, 4]), "repeat");

    canvas.addEventListener("click", function (e) {
        var [pix_x, pix_y] = event_to_pixel(e);

        if (mark_mode_enabled) {
            const new_value = !(global_decoder_obj.unknown_pixels.get(pix_x, pix_y));
            global_decoder_obj.unknown_pixels.set(pix_x, pix_y, new_value);
        } else {
            var new_value = !(global_decoder_obj.pixel_data.get(pix_x, pix_y));
            global_decoder_obj.pixel_data.set(pix_x, pix_y, new_value);
        }

        decode();
        draw_code();
        save_state();
    }, false);

    canvas.addEventListener("mousemove", function (e) {
        var [pix_x, pix_y] = event_to_pixel(e);
        if (pix_x < code_size && pix_y < code_size) {
            if (!hovered_pixel || pix_x != hovered_pixel.x || pix_y != hovered_pixel.y) {
                hovered_pixel = {"x": pix_x, "y": pix_y};
                mouse_pos_element.innerHTML = "(" + (pix_x+0) + " / " + (pix_y+0) + ")";

                var hovered_area = global_decoder_obj.static_areas.is_inside(pix_x, pix_y);
                if (!hovered_area) {
                    hovered_area = global_decoder_obj.dynamic_areas.is_inside(pix_x, pix_y);
                }

                if (highlighted_area != hovered_area) {
                    highlight_area(hovered_area);
                }

                draw_code();
            }
        }
    }, false);

    canvas.addEventListener("mouseout", function (e) {
        highlight_area(null);
        hovered_pixel = null;
        draw_code();
    }, false);
}

/// Returns a canvas filled with a hatch pattern.
function create_hatch_pattern_canvas (color, hatch_pattern_array) {
    const pattern_canvas = document.createElement("canvas");
    pattern_canvas.width = pixel_size;
    pattern_canvas.height = pixel_size;
    const pattern_context = pattern_canvas.getContext("2d");
    pattern_context.setLineDash(hatch_pattern_array);
    pattern_context.strokeStyle = color;
    pattern_context.lineWidth = pixel_size * 2;

    pattern_context.beginPath();
    pattern_context.moveTo(0, 0);
    pattern_context.lineTo(pattern_canvas.width, pattern_canvas.height);
    pattern_context.stroke();

    return pattern_canvas;
}

function event_to_pixel (e) {
    var pix_x = Math.floor((e.pageX - canvas.offsetLeft) / pixel_size);
    var pix_y = Math.floor((e.pageY - canvas.offsetTop) / pixel_size);
    return [pix_x, pix_y];
}

function draw_grid () {
    ctx.strokeStyle = "rgba(0,0,0, 0.5)";
    ctx.lineWidth = 1;
    for (i = 0; i < code_size; i++) {
        ctx.beginPath();
        ctx.moveTo(i * pixel_size, 0);
        ctx.lineTo(i * pixel_size, code_size*pixel_size);
        ctx.stroke();
        ctx.closePath();

        ctx.beginPath();
        ctx.moveTo(0, i * pixel_size);
        ctx.lineTo(code_size * pixel_size, i*pixel_size);
        ctx.stroke();
        ctx.closePath();
    }
}

function draw_rect (px, py, w, h, draw_function_name = "fillRect") {
    ctx[draw_function_name](px*pixel_size, py*pixel_size, w*pixel_size, h*pixel_size);
}

function draw_code () {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, code_size*pixel_size, code_size*pixel_size);

    var displayed_pixel_data = global_decoder_obj.pixel_data;
    if (document.getElementById("rb_show_unmasked").checked) {
        displayed_pixel_data = global_decoder_obj.get_masked_pixels();
    }
    else if (document.getElementById("rb_show_mask").checked) {
        displayed_pixel_data = global_decoder_obj.get_full_mask();
    }

    for (var x = 0; x < code_size; x++) {
        for (var y = 0; y < code_size; y++) {
            draw_pixel(x, y, displayed_pixel_data.get(x, y));
        }
    }

    ctx.strokeStyle = "black";
    ctx.lineWidth = 2.5;
    ctx.font = "11px monospace";
    for (const area of global_decoder_obj.get_all_area_objects()) {
        if (document.getElementById("cb_colors_enabled").checked) {
            ctx.fillStyle = "rgba(" + area.color[0] + ", " + area.color[1] + ", " + area.color[2] + ", 0.3)";
            for (region of area.regions.regions) {
                draw_rect(region.x, region.y, region.w, region.h);
            }
        }

        if (document.getElementById("cb_outlines_enabled").checked) {
            if (document.getElementById("cb_colors_enabled").checked) {
                ctx.strokeStyle = "black";
            } else {
                ctx.strokeStyle = "gray";
            }
            for (var line of area.outline) {
                ctx.beginPath();
                ctx.moveTo(line.x * pixel_size, line.y * pixel_size);
                ctx.lineTo((line.x+line.w) * pixel_size, (line.y+line.h) * pixel_size);
                ctx.stroke();
            }
        }

        if (document.getElementById("rb_numbers_per_area").checked) {
            for (var i = 0; i < area.num_pixels; i++) {
                const [x, y] = area.regions.pixel_coords_at_bit_offset(i);
                ctx.fillStyle = displayed_pixel_data.get(x, y) ? "white" : "black";
                ctx.fillText(("" + i).padStart(3, " "), x*pixel_size, (y+1)*pixel_size - 5);
            }
        }
    }

    if (document.getElementById("cb_grid_enabled").checked) {
        draw_grid();
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = "gray";
    for (var x = 0; x < code_size; x++) {
        for (var y = 0; y < code_size; y++) {
            if (global_decoder_obj.unknown_pixels.get(x, y)) {
                ctx.beginPath();
                ctx.arc((x+0.5)*pixel_size, (y+0.5)*pixel_size, pixel_size/2 -2, 0, 2 * Math.PI, false);
                ctx.stroke();
                ctx.closePath();
            }
        }
    }

    if (document.getElementById("rb_numbers_data_bits").checked) {
        // draw data pixel numbers:
        const pixel_decoder = new PixelDecoder(code_size, displayed_pixel_data, global_decoder_obj.static_areas);
        for (var i = 0; i < pixel_decoder.get_bit_array().length; i++) {
            const pos = pixel_decoder.get_coordinates_for_bit_offset(i);
            ctx.fillStyle = displayed_pixel_data.get(pos.x, pos.y) ? "white" : "black";
            ctx.fillText(("" + i).padStart(3, " "), pos.x*pixel_size, (pos.y+1)*pixel_size - 5);
        }
    }

    if (highlighted_differences) {
        const inset_pixels = pixel_size * 0.3;
        ctx.fillStyle = "red";
        for ({x, y, value} of highlighted_differences) {
            if (value != global_decoder_obj.pixel_data.get(x, y)) {
                ctx.fillRect(x * pixel_size + inset_pixels, y * pixel_size + inset_pixels, pixel_size - (2*inset_pixels), pixel_size - (2*inset_pixels));
            }
        }
    }

    if (highlighted_area) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = 3;
        for (var line of highlighted_area.outline) {
            ctx.beginPath();
            ctx.moveTo(line.x * pixel_size, line.y * pixel_size);
            ctx.lineTo((line.x+line.w) * pixel_size, (line.y+line.h) * pixel_size);
            ctx.stroke();
        }
    }

    if (mark_mode_enabled) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
        ctx.fillRect(0, 0, code_size*pixel_size, code_size*pixel_size);
        ctx.closePath();

        if (hovered_pixel) {
            ctx.strokeStyle = "red";
            ctx.lineWidth = 3;
            ctx.setLineDash([2, 4]);

            ctx.beginPath();
            ctx.arc((hovered_pixel.x+0.5)*pixel_size, (hovered_pixel.y+0.5)*pixel_size, pixel_size/2 -2, 0, 2 * Math.PI, false);
            ctx.stroke();
            ctx.closePath();
            ctx.setLineDash([]);
        }
    } else {
        if (hovered_pixel) {
            ctx.fillStyle = hatch_pattern;
            draw_rect(hovered_pixel.x, hovered_pixel.y, 1, 1, "fillRect");
        }
    }

    draw_preview_image();
}

function draw_pixel (px, py, set_pixel) {
    ctx.beginPath();
    ctx.fillStyle = set_pixel ? "black" : "white";
    ctx.fillRect(px*pixel_size, py*pixel_size, pixel_size, pixel_size);
    ctx.closePath();
}

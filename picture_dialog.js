//
// Popup dialog for loading and tracing a QR code from a picture
//

var picture_dialog = null;

function init_brightness_slider() {
    const background_brightness_slider = document.getElementById("range_background_brightness");
    background_brightness_slider.disabled = true;

    const main_canvas_bg_img = document.getElementById("main_canvas_background_img");
    main_canvas_bg_img.style.opacity = background_brightness_slider.value;

    background_brightness_slider.oninput = () => {
        main_canvas_bg_img.style.opacity = background_brightness_slider.value;
    };
}

function open_picture_dialog () {
    if (!picture_dialog) {
        picture_dialog = new PictureDialog();
    }
    picture_dialog.popup_panel.style.display = null;
}
class PictureDialog {

    constructor () {
        this.popup_panel = jsPanel.create({
            contentSize: "80vw 80vh",
            headerTitle: "Load Picture",
            closeOnEscape: true,
            headerControls: {
                "minimize": "remove",
            },
            onbeforeclose: (panel) => {
                panel.style.display = "none";
                return false;
            },
        });

        this.popup = this.popup_panel.content;
        this.popup.style.display = "flex";
        this.popup.style.flexDirection = "column";
        this.popup.insertAdjacentHTML("beforeend", `
            <div>
                <input type="file" id="picture_file_input" accept="image/*" />
                <input type="button" id="picture_load_button" value="Load Selected File">
                <input type="button" id="zoom_in_btn" value=" + " style="width: 6ex">
                <input type="button" id="zoom_out_btn" value=" - " style="width: 6ex">

                <span style="float: right">
                    <label><input type="color" id="color_detector_dark" value="#000000"> Dark Color</label>
                    <label><input type="color" id="color_detector_bright" value="#ffffff"> Bright Color</label>
                    <label><input type="range" id="range_detector_strictness" min="0" max="1" step="any" value="0.3"> Strictness</label>
                    <label><input type="checkbox" id="cb_detector_mark_unknown"> Add "Unknown" markers</label>
                    <input type="button" id="detect_modules_btn" value="Detect">
                </span>
            </div>
            <div id="svg_wrapper_div" style="width: 100%; height: 100%; border: solid 1px black; overflow: scroll"><svg id="picture_svg" width="100%" height="100%" tabindex="0"></svg></div>
            `);

        const picture_dialog = this;
        this.popup.querySelector("#picture_load_button").addEventListener("click", () => {
            const [file] = this.popup.querySelector("#picture_file_input").files;
            if (file) {
                const file_reader = new FileReader();
                file_reader.addEventListener("load", () => {
                    sessionStorage.setItem("picture_data", file_reader.result);

                    const new_img_obj = new Image();
                    new_img_obj.src = file_reader.result;
                    new_img_obj.onload = function () {
                        picture_dialog.load_picture(new_img_obj);
                    }
                });
                file_reader.readAsDataURL(file);
            }
        });

        if (sessionStorage.getItem("picture_data")) {
            const new_img_obj = new Image();
            new_img_obj.src = sessionStorage.getItem("picture_data");
            new_img_obj.onload = function () {
                picture_dialog.load_picture(new_img_obj);
            }
        }

        this.svg = this.popup.querySelector("#picture_svg");

        let initial_corner_coordinates;
        if (sessionStorage.getItem("picture_corners_objs")) {
            initial_corner_coordinates = JSON.parse(sessionStorage.getItem("picture_corners_objs"));
        } else {
            initial_corner_coordinates = [
                { x: 100, y: 100 },
                { x: 200, y: 100 },
                { x: 200, y: 200 },
                { x: 100, y: 200 },
            ];
        }

        this.qr_outline = new EditableQrOutline(this.svg, initial_corner_coordinates, () => {
            this.apply_corner_coordinates();
        });

        this.main_canvas_bg_img = document.getElementById("main_canvas_background_img");

        this.loaded_image_size = [0, 0];
        this.zoom_factor = 1.0;

        this.img_obj = null;

        this.popup.querySelector("#zoom_in_btn").addEventListener("click", () => {
            this.zoom_factor *= 2;
            this.redraw_svg_after_zoom();
        });
        this.popup.querySelector("#zoom_out_btn").addEventListener("click", () => {
            this.zoom_factor /= 2;
            this.redraw_svg_after_zoom();
        });

        this.popup.querySelector("#detect_modules_btn").addEventListener("click", () => {

            const dark_color = document.getElementById("color_detector_dark").value;
            const bright_color = document.getElementById("color_detector_bright").value;
            const color_strictness = document.getElementById("range_detector_strictness").value;
            const add_unknown_markers = document.getElementById("cb_detector_mark_unknown").checked;

            const css_matrix3d_transform_string_for_image = getTransformString(this.qr_outline.get_corners(), this.original_corners);
            detect_modules_from_picture(this.img_obj, css_matrix3d_transform_string_for_image, dark_color, bright_color, color_strictness, add_unknown_markers);
        });

        this.svg_div = this.popup.querySelector("#svg_wrapper_div");
        this.svg_div.addEventListener("wheel", (evt) => {
            if (evt.ctrlKey) {
                evt.preventDefault();
                evt.stopPropagation();
                const svg_div_offset = get_offset_relative_to(this.svg_div, document.body);
                const old_mouse_on_div_x = evt.clientX - svg_div_offset["left"];
                const old_mouse_on_div_y = evt.clientY - svg_div_offset["top"];
                const old_mouse_on_image_x = old_mouse_on_div_x + this.svg_div.scrollLeft;
                const old_mouse_on_image_y = old_mouse_on_div_y + this.svg_div.scrollTop;

                // my mouse wheel sometimes gives different deltaY values for scrolling up or down, which makes this behave badly:
                //const wheel_zoom_factor = (evt.deltaY / 114) * -1;
                // this will probably only work for "notched" mouse wheels; no idea how this behaves for wheels with "continuous scroll":
                const wheel_zoom_factor = (evt.deltaY > 0) ? -1 : 1;
                this.zoom_factor *= (2 ** wheel_zoom_factor);

                const new_mouse_on_image_x = old_mouse_on_image_x * (2 ** wheel_zoom_factor);
                const new_mouse_on_image_y = old_mouse_on_image_y * (2 ** wheel_zoom_factor);
                const new_div_scroll_x = new_mouse_on_image_x - old_mouse_on_div_x;
                const new_div_scroll_y = new_mouse_on_image_y - old_mouse_on_div_y;

                this.redraw_svg_after_zoom();
                this.svg_div.scrollLeft = new_div_scroll_x;
                this.svg_div.scrollTop = new_div_scroll_y;
            }
        });


        let dragging_image = false;
        let image_drag_div_start = null;
        let image_drag_pointer_start = null
        this.svg_div.addEventListener("pointerdown", (evt) => {
            if (evt.button == 0) {
                evt.preventDefault();
                evt.stopPropagation();
                evt.target.setPointerCapture(evt.pointerId);
                dragging_image = true;
                image_drag_div_start = [this.svg_div.scrollLeft, this.svg_div.scrollTop];
                image_drag_pointer_start = [evt.clientX, evt.clientY]
            }
        });
        this.svg_div.addEventListener("pointerup", (evt) => {
            evt.target.releasePointerCapture(evt.pointerId);
            dragging_image = false;
            image_drag_div_start = null;
            image_drag_pointer_start = null;
        });
        this.svg_div.addEventListener("pointermove", (evt) => {
            if (dragging_image) {
                evt.preventDefault();
                evt.stopPropagation();
                this.svg_div.scrollLeft = image_drag_div_start[0] - evt.clientX + image_drag_pointer_start[0];
                this.svg_div.scrollTop = image_drag_div_start[1] - evt.clientY + image_drag_pointer_start[1];
            }
        });


        // corner coordinates of the canvas onto which the transformed picture shall be projected:
        this.original_corners = [
            { x: 0, y: 0 },
            { x: 500, y: 0 },
            { x: 500, y: 500 },
            { x: 0, y: 500 },
        ];

        const css_matrix3d_transform_string_for_outline = getTransformString(this.original_corners, this.qr_outline.get_corners());
        this.qr_outline.set_transformation_string(css_matrix3d_transform_string_for_outline);
    }

    apply_corner_coordinates() {
        sessionStorage.setItem("picture_corners_objs", JSON.stringify(this.qr_outline.get_corners()));
        console.log("corners:", this.qr_outline.get_corners());
        const css_matrix3d_transform_string_for_image = getTransformString(this.qr_outline.get_corners(), this.original_corners);
        applyTransform(this.main_canvas_bg_img, css_matrix3d_transform_string_for_image);
        const css_matrix3d_transform_string_for_outline = getTransformString(this.original_corners, this.qr_outline.get_corners());
        this.qr_outline.set_transformation_string(css_matrix3d_transform_string_for_outline);
    }

    load_picture(img_obj) {
        console.log("load_picture; img_obj:", img_obj);

        this.img_obj = img_obj;
        this.loaded_image_size = [img_obj.width, img_obj.height];
        this.qr_outline.set_image(img_obj);

        this.main_canvas_bg_img.src = img_obj.src;
        const css_matrix3d_transform_string_for_image = getTransformString(this.qr_outline.get_corners(), this.original_corners);
        applyTransform(this.main_canvas_bg_img, css_matrix3d_transform_string_for_image);

        const background_brightness_slider = document.getElementById("range_background_brightness");
        background_brightness_slider.disabled = false;

        this.redraw_svg_after_zoom();

        this.svg_div.scrollLeft = this.loaded_image_size[0] * this.zoom_factor;
        this.svg_div.scrollTop = this.loaded_image_size[1] * this.zoom_factor;
    }

    redraw_svg_after_zoom () {
        set_attributes(this.svg, {"width": this.loaded_image_size[0] * this.zoom_factor * 3, "height": this.loaded_image_size[1] * this.zoom_factor * 3});
        set_attributes(this.svg, {"viewBox": `${this.loaded_image_size[0] * this.zoom_factor * -1} ${this.loaded_image_size[1] * this.zoom_factor * -1} ${this.loaded_image_size[0] * this.zoom_factor * 3} ${this.loaded_image_size[1] * this.zoom_factor * 3}`});

        this.qr_outline.set_zoom_factor(this.zoom_factor);
    };
}


function set_attributes (element, attributes) {
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
}


/// Outline of the QR code, with draggable corners
class EditableQrOutline {
    constructor(svg_obj, initial_corner_coordinates, on_corners_changed_callback) {
        this.svg = svg_obj;
        // current coordinates of the draggable circles:
        this.corners = initial_corner_coordinates;
        this.on_corners_changed_callback = on_corners_changed_callback;

        this.zoom_factor = 1.0;
        this.loaded_image_size = [0, 0];

        this.svg_image = svg_add_element(this.svg, "image");
        this.#add_outline_svg_elements();
        this.#add_corner_circles();
    };

    #add_outline_svg_elements() {
        this.line_group_outer = svg_add_element(this.svg, "g");
        this.line_group_outer.style.transform = "scale(" + this.zoom_factor + ")";
        this.line_group_outer.style.stroke = "rgba(255,255,255,0.3)";
        this.line_group_outer.style.strokeWidth = 2;
        this.line_group_outer.style.fill = "none";

        this.line_group_inner = svg_add_element(this.line_group_outer, "g");
        const line_group_dash1 = svg_add_element(this.line_group_inner, "g", {"id": "line_group_dash1"});
        const units_per_pixel = (500 / 25);
        svg_add_rect(line_group_dash1, 0, 0, 25*units_per_pixel, 25*units_per_pixel);
        for (const [sx,sy] of [[0,0], [18,0], [0,18]]) {
            svg_add_rect(line_group_dash1, sx*units_per_pixel, sy*units_per_pixel, 7*units_per_pixel, 7*units_per_pixel);
            svg_add_rect(line_group_dash1, (sx+1)*units_per_pixel, (sy+1)*units_per_pixel, 5*units_per_pixel, 5*units_per_pixel);
            svg_add_rect(line_group_dash1, (sx+2)*units_per_pixel, (sy+2)*units_per_pixel, 3*units_per_pixel, 3*units_per_pixel);
        }
        svg_add_rect(line_group_dash1, 16*units_per_pixel, 16*units_per_pixel, 5*units_per_pixel, 5*units_per_pixel);
        svg_add_rect(line_group_dash1, 17*units_per_pixel, 17*units_per_pixel, 3*units_per_pixel, 3*units_per_pixel);
        svg_add_rect(line_group_dash1, 18*units_per_pixel, 18*units_per_pixel, 1*units_per_pixel, 1*units_per_pixel);

        for (var x = 8; x <= 16; x+=2) {
            svg_add_rect(line_group_dash1, x*units_per_pixel, 6*units_per_pixel, 1*units_per_pixel, 1*units_per_pixel);
        }
        for (var y = 8; y <= 16; y+=2) {
            svg_add_rect(line_group_dash1, 6*units_per_pixel, y*units_per_pixel, 1*units_per_pixel, 1*units_per_pixel);
        }

        // draw dashed lines again, but with different color (to get two-colored dashes):
        const line_group_dash2 = svg_add_element(this.line_group_inner, "g");
        svg_add_element(line_group_dash2, "use", {"href": "#line_group_dash1"});
        line_group_dash2.style.stroke = "red";
        line_group_dash2.style.strokeDasharray = "4";
    }

    set_image(img_obj) {
        this.loaded_image_size = [img_obj.width, img_obj.height];
        set_attributes(this.svg_image, {"width": this.loaded_image_size[0] * this.zoom_factor, "height": this.loaded_image_size[1] * this.zoom_factor, "href": img_obj.src});
        this.svg_image.style.imageRendering = "crisp-edges";
    };

    set_zoom_factor(new_zoom_factor) {
        this.zoom_factor = new_zoom_factor;
        set_attributes(this.svg_image, {"width": this.loaded_image_size[0] * this.zoom_factor, "height": this.loaded_image_size[1] * this.zoom_factor});

        for (const c of this.corner_circles) {
            c.setAttribute("cx", this.corners[c.corner_index].x * this.zoom_factor);
            c.setAttribute("cy", this.corners[c.corner_index].y * this.zoom_factor);
        }

        this.line_group_outer.style.transform = "scale(" + this.zoom_factor + ")";
    };

    set_transformation_string(css_matrix3d_transform_string) {
        // Note: looks like this only works in Firefox, since apparently Chromium treats matrix3d() on SVG elements differently
        // (according to https://stackoverflow.com/questions/74690178/css3-transform-matrix3d-gives-other-results-in-chrome-edge-safari-vs-firefox).
        applyTransform(this.line_group_inner, css_matrix3d_transform_string);
    }

    get_corners() {
        return this.corners;
    }

    static #event_parent_coords(evt) {
        const parent_bounds = evt.target.parentElement.getBoundingClientRect();
        return [evt.clientX - parent_bounds.left, evt.clientY - parent_bounds.top];
    }

    #add_corner_circles() {
        this.corner_circles = [];
        let last_corner = null;
        for (var i = 0; i < 4; i++) {
            const circle = svg_add_circle(this.svg, this.corners[i].x * this.zoom_factor, this.corners[i].y * this.zoom_factor, 10);
            this.corner_circles.push(circle);
            circle.style.fill = "rgba(0,0,0,0.5)";
            circle.style.stroke = "red";
            circle.style.strokeWidth = "2px";
            circle.style.strokeDasharray = "3 3";
            circle.addEventListener("pointerover", (evt) => {
                evt.target.style.fill = "rgba(255,0,0,0.5)";
            });
            circle.addEventListener("pointerout", (evt) => {
                evt.target.style.fill = "rgba(0,0,0,0.5)";
            });

            circle.corner_index = i;
            circle.drag_active = false;
            circle.addEventListener("pointerdown", (evt) => {
                if (evt.button == 0) {
                    evt.stopPropagation();

                    evt.target.setPointerCapture(evt.pointerId);
                    evt.target.drag_active = true;
                    last_corner = evt.target;
                    const [x, y] = EditableQrOutline.#event_parent_coords(evt);

                    if (evt.shiftKey) {
                        for (const c of this.corner_circles) {
                            c.drag_offset = [x - c.getAttribute("cx"), y - c.getAttribute("cy")];
                        }
                    } else {
                        evt.target.drag_offset = [x - evt.target.getAttribute("cx"), y - evt.target.getAttribute("cy")];
                    }
                }
            });
            circle.addEventListener("pointerup", (evt) => {
                evt.stopPropagation();

                evt.target.releasePointerCapture(evt.pointerId);
                evt.target.drag_active = false;
                for (const c of this.corner_circles) {
                    c.drag_offset = null;
                }
            });
            circle.addEventListener("pointermove", (evt) => {
                if (evt.target.drag_active) {
                    const [x, y] = EditableQrOutline.#event_parent_coords(evt);

                    for (const c of this.corner_circles) {
                        if (c.drag_offset != null) {
                            const center_x = x - c.drag_offset[0];
                            const center_y = y - c.drag_offset[1];
                            c.setAttribute("cx", center_x);
                            c.setAttribute("cy", center_y);
                            this.corners[c.corner_index] = {x: center_x / this.zoom_factor, y: center_y / this.zoom_factor};
                        }
                    }

                    this.on_corners_changed_callback();
                }
            });
        }

        this.svg.addEventListener("keydown", (evt) => {
            if (last_corner) {
                const [orig_cx, orig_cy] = [parseFloat(last_corner.getAttribute("cx")), parseFloat(last_corner.getAttribute("cy"))];
                var [cx, cy] = [orig_cx, orig_cy];
                const step_width = 0.1;
                switch (evt.key) {
                    case "ArrowLeft":
                        cx -= step_width;
                        break;
                    case "ArrowRight":
                        cx += step_width;
                        break;
                    case "ArrowUp":
                        cy -= step_width;
                        break;
                    case "ArrowDown":
                        cy += step_width;
                        break;
                }

                if (cx != orig_cx || cy != orig_cy) {
                    last_corner.setAttribute("cx", cx);
                    last_corner.setAttribute("cy", cy);
                    this.corners[last_corner.corner_index] = {x: cx / this.zoom_factor, y: cy / this.zoom_factor};
                    this.on_corners_changed_callback();

                    evt.preventDefault();
                }
            }
        });
    }
};


function svg_add_element (svg, element_name, attributes = {}) {
    const elem = document.createElementNS("http://www.w3.org/2000/svg", element_name);
    set_attributes(elem, attributes);
    svg.appendChild(elem);
    return elem;
}

function svg_add_circle (svg, cx, cy, r) {
    return svg_add_element(svg, "circle", {"cx": cx, "cy": cy, "r": r});
}

function svg_add_line (svg, x1, y1, x2, y2, stroke) {
    return svg_add_element(svg, "line", {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "stroke": stroke});
}

function svg_add_rect (svg, x, y, width, height, stroke) {
    return svg_add_element(svg, "rect", {"x": x, "y": y, "width": width, "height": height, "stroke": stroke});
}


function getTransform(from, to) {
    var A, H, b, h, i, k_i, lhs, rhs, _i, _j, _k, _ref;
    console.assert((from.length === (_ref = to.length) && _ref === 4));
    A = [];
    for (i = _i = 0; _i < 4; i = ++_i) {
        A.push([from[i].x, from[i].y, 1, 0, 0, 0, -from[i].x * to[i].x, -from[i].y * to[i].x]);
        A.push([0, 0, 0, from[i].x, from[i].y, 1, -from[i].x * to[i].y, -from[i].y * to[i].y]);
    }
    b = [];
    for (i = _j = 0; _j < 4; i = ++_j) {
        b.push(to[i].x);
        b.push(to[i].y);
    }
    h = numeric.solve(A, b);

    H = [[h[0], h[1], 0, h[2]], [h[3], h[4], 0, h[5]], [0, 0, 1, 0], [h[6], h[7], 0, 1]];

    // this is a hack (I don't really understand why this works):
    if (numeric.dot(H, [from[0].x, from[0].y, 0, 1])[3] < 0) {
        // console.log("negating H");
        H = H.map((arr) => arr.map((e) => e*-1));
    }

    for (i = _k = 0; _k < 4; i = ++_k) {
        lhs = numeric.dot(H, [from[i].x, from[i].y, 0, 1]);
        k_i = lhs[3];
        rhs = numeric.dot(k_i, [to[i].x, to[i].y, 0, 1]);
        console.assert(numeric.norm2(numeric.sub(lhs, rhs)) < 1e-9, "Not equal:", lhs, rhs);
    }

    return H;
};

function transpose(matrix) {
    return matrix[0].map((col, i) => matrix.map(row => row[i]));
}

function getTransformString(originalPos, targetPos) {
    const H = getTransform(originalPos, targetPos);
    const H_transposed = transpose(H);
    const matrix_of_strings = H_transposed.map((arr) => arr.map((e) => e.toFixed(20)));
    return "matrix3d(" + matrix_of_strings.join(",") + ")";
};

function applyTransform(element, transform_matrix_string) {
    element.style.transform = transform_matrix_string;
    element.style.transformOrigin = "0 0";
};

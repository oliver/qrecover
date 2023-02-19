//
// Popup dialog for loading and tracing a QR code from a picture
//

var picture_dialog = null;

function open_picture_dialog () {
    if (!picture_dialog) {
        picture_dialog = new PictureDialog();
        picture_dialog.popup.destroy = function () {
            picture_dialog.popup.style.display = "none";
        }
    }
    picture_dialog.popup.style.display = null;
}

class PictureDialog {
    constructor () {
        this.popup = create_popup_dialog(document.body);
        this.popup.insertAdjacentHTML("beforeend", '<h3>Load Picture</h3>\
            <input type="file" id="picture_file_input" accept="image/*" />\
            <input type="button" id="picture_load_button" value="Load Selected File">\
            <input type="button" id="zoom_in_btn" value=" + " style="width: 6ex"> \
            <input type="button" id="zoom_out_btn" value=" - " style="width: 6ex"> \
            <br>\
            <div id="svg_wrapper_div" style="width: 100%; height: 80%; border: solid 1px black; overflow: scroll"><svg id="picture_svg" width="100%" height="80%" tabindex="0"></svg></div><br> \
            <div id="picture_transform_preview" style="background-color: silver"></div> \
            <div id="canvas_wrapper" style="background-color: silver; position: relative; width: 200px; height: 200px; overflow: hidden; outline: solid 1px black"> \
                <canvas id="picture_canvas" style="width: 100%; height: 100%; background-color: antiquewhite"></canvas>\
            </div> \
            ');
        this.canvas = this.popup.querySelector("#picture_canvas");

        this.popup.style.left = "50%";
        this.popup.style.right = "10ex";
        this.popup.style.top = "10ex";
        this.popup.style.bottom = "10ex";

        const picture_dialog = this;
        this.popup.querySelector("#picture_load_button").addEventListener("click", () => {
            const [file] = this.popup.querySelector("#picture_file_input").files;
            if (file) {
                const img_obj = new Image();
                img_obj.src = URL.createObjectURL(file);
                img_obj.onload = function () {
                    picture_dialog.load_picture(img_obj);
                }

                const file_reader = new FileReader();
                file_reader.addEventListener("load", () => {
                    sessionStorage.setItem("picture_data", file_reader.result);
                });
                file_reader.readAsDataURL(file);
            }
        });

        if (sessionStorage.getItem("picture_data")) {
            const img_obj = new Image();
            img_obj.src = sessionStorage.getItem("picture_data");
            img_obj.onload = function () {
                picture_dialog.load_picture(img_obj);
            }
        }

        this.svg = this.popup.querySelector("#picture_svg");
        this.svg_image = svg_add_element(this.svg, "image");

        this.main_canvas_bg_img = document.getElementById("main_canvas_background_img");

        this.loaded_image_size = [0, 0];
        this.zoom_factor = 1.0;

        this.popup.querySelector("#zoom_in_btn").addEventListener("click", () => {
            this.zoom_factor *= 2;
            this.redraw_svg_after_zoom();
        });
        this.popup.querySelector("#zoom_out_btn").addEventListener("click", () => {
            this.zoom_factor /= 2;
            this.redraw_svg_after_zoom();
        });

        function event_parent_coords (evt) {
            const parent_bounds = evt.target.parentElement.getBoundingClientRect();
            return [evt.clientX - parent_bounds.left, evt.clientY - parent_bounds.top];
        }

        this.original_corners = [ [0,0], [500,0], [500,500], [0,500] ];
        this.corners = [ [100,100], [200,100], [200,200], [100,200] ];

        if (sessionStorage.getItem("picture_corners")) {
            this.corners = JSON.parse(sessionStorage.getItem("picture_corners"));
        }
        applyTransform(this.canvas, this.corners, this.original_corners, null);

        this.line_group_outer = svg_add_element(this.svg, "g");
        this.line_group_outer.style.transform = "scale(" + this.zoom_factor + ")";
        this.line_group_outer.style.stroke = "white";
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

        const line_group_dash2 = svg_add_element(this.line_group_inner, "g");
        svg_add_element(line_group_dash2, "use", {"href": "#line_group_dash1"});
        line_group_dash2.style.stroke = "red";
        line_group_dash2.style.strokeDasharray = "4";

        applyTransform(this.line_group_inner, this.original_corners, this.corners, null);

        this.corner_circles = [];
        var last_corner = null;
        for (var i = 0; i < 4; i++) {
            const circle = svg_add_circle(this.svg, this.corners[i][0] * this.zoom_factor, this.corners[i][1] * this.zoom_factor, 10);
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
                    evt.target.setPointerCapture(evt.pointerId);
                    evt.target.drag_active = true;
                    last_corner = evt.target;
                    const [x, y] = event_parent_coords(evt);

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
                evt.target.releasePointerCapture(evt.pointerId);
                evt.target.drag_active = false;
                for (const c of this.corner_circles) {
                    c.drag_offset = null;
                }
            });
            circle.addEventListener("pointermove", (evt) => {
                if (evt.target.drag_active) {
                    const [x, y] = event_parent_coords(evt);

                    for (const c of this.corner_circles) {
                        if (c.drag_offset != null) {
                            const center_x = x - c.drag_offset[0];
                            const center_y = y - c.drag_offset[1];
                            c.setAttribute("cx", center_x);
                            c.setAttribute("cy", center_y);
                            this.corners[c.corner_index] = [center_x / this.zoom_factor, center_y / this.zoom_factor];
                        }
                    }

                    this.apply_corner_coordinates();
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
                    this.corners[last_corner.corner_index] = [cx / this.zoom_factor, cy / this.zoom_factor];
                    this.apply_corner_coordinates();

                    evt.preventDefault();
                }
            }
        });

        this.draw();
    }

    apply_corner_coordinates() {
        sessionStorage.setItem("picture_corners", JSON.stringify(this.corners));
        console.log("corners:", this.corners);
        applyTransform(this.canvas, this.corners, this.original_corners, null);
        applyTransform(this.main_canvas_bg_img, this.corners, this.original_corners, null);
        applyTransform(this.line_group_inner, this.original_corners, this.corners, null);
    }

    load_picture(img_obj) {
        console.log("load_picture; img_obj:", img_obj);

        this.loaded_image_size = [img_obj.width, img_obj.height];

        set_attributes(this.svg_image, {"width": this.loaded_image_size[0] * this.zoom_factor, "height": this.loaded_image_size[1] * this.zoom_factor, "href": img_obj.src});
        this.svg_image.style.imageRendering = "crisp-edges";

        this.canvas.style.width = img_obj.width + "px";
        this.canvas.style.height = img_obj.height + "px";
        this.canvas.width = img_obj.width;
        this.canvas.height = img_obj.height;
        this.canvas.getContext("2d").drawImage(img_obj, 0, 0, img_obj.width, img_obj.height);
        this.draw();

        this.main_canvas_bg_img.src = img_obj.src;
        applyTransform(this.main_canvas_bg_img, this.corners, this.original_corners, null);
    }

    draw () {
        const ctx = this.canvas.getContext("2d");
        ctx.strokeStyle = "black";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        var corners = [ [100,100], [200,100], [200,200], [100,200] ];

        ctx.beginPath();
        ctx.moveTo(corners[3][0], corners[3][1]);
        for (var i = 0; i < 4; i++) {
            ctx.lineTo(corners[i][0], corners[i][1]);
        }
        ctx.stroke();
    }

    redraw_svg_after_zoom () {
        set_attributes(this.svg, {"width": this.loaded_image_size[0] * this.zoom_factor, "height": this.loaded_image_size[1] * this.zoom_factor});
        set_attributes(this.svg_image, {"width": this.loaded_image_size[0] * this.zoom_factor, "height": this.loaded_image_size[1] * this.zoom_factor});

        for (const c of this.corner_circles) {
            c.setAttribute("cx", this.corners[c.corner_index][0] * this.zoom_factor);
            c.setAttribute("cy", this.corners[c.corner_index][1] * this.zoom_factor);
        }

        this.line_group_outer.style.transform = "scale(" + this.zoom_factor + ")";
    };
}


function set_attributes (element, attributes) {
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
}

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


getTransform = function(from, to) {
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
  for (i = _k = 0; _k < 4; i = ++_k) {
    lhs = numeric.dot(H, [from[i].x, from[i].y, 0, 1]);
    k_i = lhs[3];
    rhs = numeric.dot(k_i, [to[i].x, to[i].y, 0, 1]);
    console.assert(numeric.norm2(numeric.sub(lhs, rhs)) < 1e-9, "Not equal:", lhs, rhs);
  }
  return H;
};


applyTransform = function(element, originalPos, targetPos, callback) {
  var H, from, i, j, p, to;
  from = (function() {
    var _i, _len, _results;
    _results = [];
    for (_i = 0, _len = originalPos.length; _i < _len; _i++) {
      p = originalPos[_i];
      _results.push({
        x: p[0],
        y: p[1]
      });
    }
    return _results;
  })();
  to = (function() {
    var _i, _len, _results;
    _results = [];
    for (_i = 0, _len = targetPos.length; _i < _len; _i++) {
      p = targetPos[_i];
      _results.push({
        x: p[0],
        y: p[1]
      });
    }
    return _results;
  })();
  H = getTransform(from, to);

  const transform_matrix_string = ((function() {
    var _i, _results;
    _results = [];
    for (i = _i = 0; _i < 4; i = ++_i) {
      _results.push((function() {
        var _j, _results1;
        _results1 = [];
        for (j = _j = 0; _j < 4; j = ++_j) {
          _results1.push(H[j][i].toFixed(20));
        }
        return _results1;
      })());
    }
    return _results;
  })()).join(',');
  element.style.transform = "matrix3d(" + transform_matrix_string + ")";
  element.style.transformOrigin = "0 0";
};

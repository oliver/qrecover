//
// Popup dialog for loading and tracing a QR code from a picture
//

function open_picture_dialog () {
    new PictureDialog();
}

class PictureDialog {
    constructor () {
        this.popup = create_popup_dialog(document.body);
        this.popup.insertAdjacentHTML("beforeend", '<h3>Load Picture</h3>\
            <input type="file" id="picture_file_input" accept="image/*" />\
            <input type="button" id="picture_load_button" value="Load Selected File">\
            <br>\
            <svg id="picture_svg" width="50%" height="50%" style="border: solid 1px black"></svg><br> \
            <canvas id="picture_canvas" style="width: 30%; height: 30%; background-color: antiquewhite; position: absolute; right: 0px"></canvas>\
            ');
        this.canvas = this.popup.querySelector("#picture_canvas");

        this.popup.style.left = "10ex";
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
            }
        });

        // adjust canvas pixel size to its DOM element size:
        const canvas_rect = this.canvas.getBoundingClientRect();
        this.canvas.width = canvas_rect.width;
        this.canvas.height = canvas_rect.height;


        this.svg = this.popup.querySelector("#picture_svg");
        this.svg_image = svg_add_element(this.svg, "image");

        function event_parent_coords (evt) {
            const parent_bounds = evt.target.parentElement.getBoundingClientRect();
            return [evt.clientX - parent_bounds.left, evt.clientY - parent_bounds.top];
        }

        this.original_corners = [ [0,0], [100,0], [100,100], [0,100] ];
        this.corners = [ [100,100], [200,100], [200,200], [100,200] ];

        if (sessionStorage.getItem("picture_corners")) {
            this.corners = JSON.parse(sessionStorage.getItem("picture_corners"));
        }
        applyTransform(this.canvas, this.corners, this.original_corners, null);

        for (var i = 0; i < 4; i++) {
            const next_i = (i+1) % 4;
            svg_add_line(this.svg, this.corners[i][0], this.corners[i][1], this.corners[next_i][0], this.corners[next_i][1], "black");
        }

        for (var i = 0; i < 4; i++) {
            const circle = svg_add_circle(this.svg, this.corners[i][0], this.corners[i][1], 10);
            circle.style.fill = "rgba(0,0,0,0.5)";
            circle.addEventListener("pointerover", (evt) => {
                evt.target.style.fill = "rgba(255,0,0,0.5)";
            });
            circle.addEventListener("pointerout", (evt) => {
                evt.target.style.fill = "rgba(0,0,0,0.5)";
            });

            circle.corner_index = i;

            circle.drag_active = false;
            circle.addEventListener("pointerdown", (evt) => {
                evt.target.setPointerCapture(evt.pointerId);
                evt.target.drag_active = true;
            });
            circle.addEventListener("pointerup", (evt) => {
                evt.target.releasePointerCapture(evt.pointerId);
                evt.target.drag_active = false;
            });
            circle.addEventListener("pointermove", (evt) => {
                if (evt.target.drag_active) {
                    const [x, y] = event_parent_coords(evt);
                    evt.target.setAttribute("cx", x);
                    evt.target.setAttribute("cy", y);

                    this.corners[evt.target.corner_index] = [x, y];
                    sessionStorage.setItem("picture_corners", JSON.stringify(this.corners));
                    applyTransform(this.canvas, this.corners, this.original_corners, null);
                }
            });
        }

        this.draw();
    }

    load_picture(img_obj) {
        console.log("load_picture; img_obj:", img_obj);

        set_attributes(this.svg_image, {"width": img_obj.width, "height": img_obj.height, "href": img_obj.src});

        this.canvas.getContext("2d").drawImage(img_obj, 0, 0, img_obj.width, img_obj.height);
        this.draw();
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

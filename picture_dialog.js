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
            <svg id="picture_svg" width="50%" height="50%"></svg> \
            <canvas id="picture_canvas" style="width: 100%; height: 85%; background-color: antiquewhite;"></canvas>\
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

        var corners = [ [100,100], [200,100], [200,200], [100,200] ];

        for (var i = 0; i < 4; i++) {
            const next_i = (i+1) % 4;
            svg_add_line(this.svg, corners[i][0], corners[i][1], corners[next_i][0], corners[next_i][1], "black");
        }

        for (var i = 0; i < 4; i++) {
            const circle = svg_add_circle(this.svg, corners[i][0], corners[i][1], 10);
            circle.addEventListener("pointerover", (evt) => {
                evt.target.style.fill = "red";
            });
            circle.addEventListener("pointerout", (evt) => {
                evt.target.style.fill = null;
            });

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

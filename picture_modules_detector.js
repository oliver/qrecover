//
// Detects the QR code "modules" (pixels) from a picture
//

function detect_modules_from_picture(img_obj, css_matrix3d_transform_string) {
    const canvas = document.createElement("canvas");
    // the supplied transformation matrix is sized for mapping the input image to a 500x500 pixel image:
    canvas.width = 500;
    canvas.height = 500;

    draw_transformed_image_to_canvas(img_obj, css_matrix3d_transform_string, canvas).then(() => {
        const ctx = canvas.getContext("2d");

        for (let y = 0; y < 25; y++) {
            for (let x = 0; x < 25; x++) {
                const color = get_module_color(ctx, x, y);
                if (color[0] < 64) {
                    global_decoder_obj.pixel_data.set(x, y, true);
                } else if (color[0] >= 192) {
                    global_decoder_obj.pixel_data.set(x, y, false);
                } else {
                    global_decoder_obj.unknown_pixels.set(x, y, true);
                }
            }
        }

        decode();
        draw_code();
        save_state();
    });

}

function get_module_color(ctx, module_x, module_y) {
    const image_width = 500;
    const num_modules_x = 25;
    const module_size = image_width / num_modules_x;

    const pixel_data = ctx.getImageData(module_x * module_size, module_y * module_size, module_size, module_size);

    let rgba_sum = [0, 0, 0, 0];
    for (let y = 0; y < module_size; y++) {
        for (let x = 0; x < module_size; x++) {
            const index = (y * pixel_data.width + x) * 4;
            rgba_sum[0] += pixel_data.data[index + 0];
            rgba_sum[1] += pixel_data.data[index + 1];
            rgba_sum[2] += pixel_data.data[index + 2];
            rgba_sum[3] += pixel_data.data[index + 3];
        }
    }
    const num_pixels = module_size**2;
    const rgba_average = [
        rgba_sum[0] / num_pixels,
        rgba_sum[1] / num_pixels,
        rgba_sum[2] / num_pixels,
        rgba_sum[3] / num_pixels,
    ];
    return rgba_average;
}


function draw_transformed_image_to_canvas(img_obj, css_matrix3d_transform_string, target_canvas) {
    // create SVG element:
    const template = document.createElement("template");
    template.innerHTML = '<svg id="detector_svg" width="500" height="500"><image id="detector_image"></image></svg>';
    const svg_obj = template.content.children[0];

    // put bitmap image into SVG, and transform it according to supplied matrix3d:
    const svg_image_obj = svg_obj.querySelector("#detector_image");
    svg_image_obj.setAttribute("href", img_obj.src);
    svg_image_obj.style.transform = css_matrix3d_transform_string;
    svg_image_obj.style.transformOrigin = "0 0";

    // serialize SVG into a string:
    const svg_xml = new XMLSerializer().serializeToString(svg_obj);
    const svg_b64 = "data:image/svg+xml;base64," + btoa(svg_xml);

    // create Image object from serialized SVG, and draw Image onto canvas:
    const temp_image = new Image();
    const promise = new Promise((resolve) => {
        temp_image.onload = () => {
            target_canvas.getContext("2d").drawImage(temp_image, 0, 0);
            resolve();
        };
    });
    temp_image.src = svg_b64;

    return promise;
}

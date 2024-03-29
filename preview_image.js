//
// Functions for working with the small preview image
//

var preview_canvas, preview_context, preview_image;

function init_preview_image (preview_canvas_element, preview_image_element) {
    preview_canvas = preview_canvas_element;
    preview_canvas.width = code_size;
    preview_canvas.height = code_size;
    preview_context = preview_canvas.getContext("2d");
    preview_image = preview_image_element;
    preview_image.width = code_size * 3;
}

function draw_preview_image () {
    preview_context.fillStyle = "white";
    preview_context.fillRect(0, 0, code_size, code_size);

    var image_data = preview_context.getImageData(0, 0, code_size, code_size);
    for (var x = 0; x < code_size; x++) {
        for (var y = 0; y < code_size; y++) {
            var color;
            if (global_decoder_obj.pixel_data.get(x, y)) {
                if (global_decoder_obj.unknown_pixels.get(x, y)) {
                    color = 96;
                } else {
                    color = 0;
                }
            } else {
                if (global_decoder_obj.unknown_pixels.get(x, y)) {
                    color = 160;
                } else {
                    color = 255;
                }
            }

            const offset = y * (code_size * 4) + x * 4;
            image_data.data[offset+0] = color;
            image_data.data[offset+1] = color;
            image_data.data[offset+2] = color;
        }
    }

    preview_context.putImageData(image_data, 0, 0);
    preview_image.src = preview_canvas.toDataURL();
}

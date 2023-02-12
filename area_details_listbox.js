//
// Functions for managing the HTML list which shows area details
//

/// Helper function to recursively get the top and left offset between a start_element and the target_element (which must be in start_element's parent hierarchy).
function get_offset_relative_to (start_element, target_element) {
    if (start_element == target_element) {
        return {"top": 0, "left": 0}
    }
    const parent_values = get_offset_relative_to(start_element.offsetParent, target_element);
    return {
        "top": parent_values["top"] + start_element.offsetTop,
        "left": parent_values["left"] + start_element.offsetLeft
    };
}


function update_area_details_list (decoder) {
    var table_body = document.getElementById("area_table_body");
    table_body.innerHTML = "";

    for (const area of decoder.get_all_area_objects()) {
        var new_row = table_body.insertRow();
        area.dom_elements.set("area_table_div", new_row);
        new_row.addEventListener("mouseover", function (e) {
            highlight_area(area);
        });
        new_row.addEventListener("mouseout", function (e) {
            highlight_area(null);
        });

        // preserve highlighting in area list when clicking on canvas:
        if (highlighted_area && area.id == highlighted_area.id) {
            highlighted_area = area;
        }

        const result_obj = area.value_details;

        function add_cell (obj, func) {
            var cell = new_row.insertCell();
            if (obj !== undefined) {
                func(cell);
            } else {
                cell.innerHTML = "&nbsp;";
            }
            return cell;
        }

        add_cell(area.value_details.offset, (cell) => { cell.innerHTML = area.value_details.offset; }).style.textAlign = "right";
        add_cell(area.id, (cell) => { cell.innerHTML = area.id; });

        add_cell(area.value_details.value, (cell) => { cell.innerHTML = area.value_details.value; }).style.textAlign = "right";
        var num_hex_digits = Math.ceil(area.value_details.num_bits / 4);
        add_cell(area.value_details.value, (cell) => { cell.innerHTML = "0x" + area.value_details.value.toString(16).padStart(num_hex_digits,"0"); }).style.textAlign = "right";
        var num_bin_digits = area.value_details.num_bits;
        add_cell(area.value_details.value, (cell) => { cell.innerHTML = area.value_details.value.toString(2).padStart(num_bin_digits,"0"); }).style.textAlign = "right";

        add_cell(area.value_details.valid, (cell) => {
            cell.innerHTML = (area.value_details.valid ? "\u2713" : "\u2718");
            cell.style.textAlign = "center";
            cell.style.color = (area.value_details.valid ? "green" : "white");
            cell.style.backgroundColor = (area.value_details.valid ? "" : "red");
        });
        add_cell(area.value_details.desc, (cell) => {
            if (area.value_details.replacements && area.value_details.replacements.length > 0) {
                cell.innerHTML += "<span style='text-decoration: underline dashed;'>" + area.value_details.desc + " <button>Fix</button></span>";

                const span = cell.querySelector("span");
                span.addEventListener("mouseover", function (e) {
                    show_correction(area.value_details.replacements);
                }, false);
                span.addEventListener("mouseout", function (e) {
                    show_correction(null);
                }, false);

                const button = cell.querySelector("button");
                button.addEventListener("click", function (e) {
                    apply_correction(area.value_details.replacements);
                    show_correction(null);
                }, false);
            } else if (area.value_details.replacement_candidates && area.value_details.replacement_candidates.length > 0) {
                cell.innerHTML += area.value_details.desc + " <button>Show Values...</button>";

                const button = cell.querySelector("button");
                button.addEventListener("click", function (e) {
                    const popup_div = create_popup_dialog(document.querySelector("#area_table_div"));
                    popup_div.insertAdjacentHTML("beforeend", "<h3>Possible Values</h3>Current: " + area.value_details.desc + "<ul></ul>");
                    popup_div.style.maxHeight = "80%";

                    var list_element = popup_div.querySelector("ul");
                    for (let replacement_candidate of area.value_details.replacement_candidates) {
                        const new_sub_item = document.createElement("li");
                        new_sub_item.innerHTML = "<span style='text-decoration: underline dashed;'>" + replacement_candidate.desc + " <button>Apply</button></span>";
                        list_element.appendChild(new_sub_item);

                        const span = new_sub_item.querySelector("span");
                        span.addEventListener("mouseover", function (e) {
                            show_correction(replacement_candidate.replacements);
                        }, false);
                        span.addEventListener("mouseout", function (e) {
                            show_correction(null);
                        }, false);

                        const button = new_sub_item.querySelector("button");
                        button.addEventListener("click", function (e) {
                            apply_correction(replacement_candidate.replacements);
                            show_correction(null);
                            popup_div.destroy();
                        }, false);
                    }

                    const button_offset = get_offset_relative_to(button, document.querySelector("#area_table_div"));
                    popup_div.style.top = (button_offset.top - ((popup_div.clientHeight - button.clientHeight) / 2)) + "px";
                    popup_div.style.left = (button_offset.left - popup_div.clientWidth - 20) + "px";
                }, false);
            } else {
                cell.innerHTML = area.value_details.desc;
            }
        });
    }
}

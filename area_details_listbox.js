//
// Functions for managing the HTML list which shows area details
//

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
        add_cell(area.value_details.desc, (cell) => { cell.innerHTML = area.value_details.desc });
    }
}

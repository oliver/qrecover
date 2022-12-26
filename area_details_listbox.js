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

        var result_obj;
        try {
            result_obj = area.check_function(area);
        } catch (ex) {
            result_obj = {"valid": false, "desc": "Error: " + ex};
            if (ex.hasOwnProperty("x")) {
                result_obj.desc = "Invalid Pixel at (" + ex.x + "/" + ex.y + ")";
            } else if (ex.desc) {
                result_obj.desc = "Error</span> (" + ex.desc + ")";
            } else {
                result_obj.desc = "Invalid Pixels (" + ex + ")";
            }
        }

        function add_cell (obj, func) {
            var cell = new_row.insertCell();
            if (obj !== undefined) {
                func(cell);
            } else {
                cell.innerHTML = "&nbsp;";
            }
            return cell;
        }

        add_cell(result_obj["offset"], (cell) => { cell.innerHTML = result_obj["offset"]; }).style.textAlign = "right";
        add_cell(area.id, (cell) => { cell.innerHTML = area.id; });

        add_cell(result_obj["value"], (cell) => { cell.innerHTML = result_obj["value"]; }).style.textAlign = "right";
        var num_hex_digits = Math.ceil(result_obj["num_bits"] / 4);
        add_cell(result_obj["value"], (cell) => { cell.innerHTML = "0x" + result_obj["value"].toString(16).padStart(num_hex_digits,"0"); }).style.textAlign = "right";
        var num_bin_digits = result_obj["num_bits"];
        add_cell(result_obj["value"], (cell) => { cell.innerHTML = result_obj["value"].toString(2).padStart(num_bin_digits,"0"); }).style.textAlign = "right";

        add_cell(result_obj["valid"], (cell) => {
            cell.innerHTML = (result_obj["valid"] ? "\u2713" : "\u2718");
            cell.style.textAlign = "center";
            cell.style.color = (result_obj["valid"] ? "green" : "white");
            cell.style.backgroundColor = (result_obj["valid"] ? "" : "red");
        });
        add_cell(result_obj["desc"], (cell) => { cell.innerHTML = result_obj["desc"] });
    }
}

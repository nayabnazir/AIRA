def parse_uml_lines(lines):
    classes = []
    interfaces = {}

    current = None
    current_type = None

    for line in lines:

        # ---------- INTERFACE ----------
        if "interface" in line and not line.startswith("+"):
            name = "Interface"

            if name not in interfaces:
                interfaces[name] = {
                    "name": name,
                    "methods": []
                }

            current = interfaces[name]
            current_type = "interface"
            continue

        # ---------- CLASS ----------
        if "classname" in line:
            current = {
                "name": "classname",
                "attributes": [],
                "methods": []
            }
            classes.append(current)
            current_type = "class"
            continue

        # ---------- METHOD ----------
        if line.startswith("+") and "(" in line:
            if current and current_type == "interface":
                current["methods"].append(line)
            elif current and current_type == "class":
                current["methods"].append(line)
            continue

        # ---------- ATTRIBUTE ----------
        if line.startswith("+") and ":" in line:
            if current and current_type == "class":
                current["attributes"].append(line)
            continue

    return {
        "classes": classes,
        "interfaces": list(interfaces.values())
    }

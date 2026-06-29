from graphviz import Digraph


def generate_uml_diagram(uml_data):
    """
    Input: Structured UML (classes + interfaces)
    Output: Editable UML diagram (Graphviz)
    """

    dot = Digraph("UML_Diagram", format="png")
    dot.attr(rankdir="TB", fontname="Arial")

    # -------- CLASSES --------
    for cls in uml_data.get("classes", []):
        name = cls["name"]

        attrs = "\\l".join(cls.get("attributes", [])) + "\\l"
        methods = "\\l".join(cls.get("methods", [])) + "\\l"

        label = f"""{{{name}|{attrs}|{methods}}}"""
        dot.node(name, label=label, shape="record")

    # -------- INTERFACES --------
    for interface in uml_data.get("interfaces", []):
        name = interface["name"]

        methods = "\\l".join(interface.get("methods", [])) + "\\l"
        label = f"""{{<<interface>>\\n{name}|{methods}}}"""

        dot.node(name, label=label, shape="record")

    # -------- IMPLEMENTATION RELATION --------
    for cls in uml_data.get("classes", []):
        for interface in uml_data.get("interfaces", []):
            dot.edge(cls["name"], interface["name"], label="implements", style="dashed")

    return dot

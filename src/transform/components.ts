import { OptionalKind, Project, PropertySignatureStructure } from "ts-morph";
import { ComponentsObject } from "../typing";
import {
  getObjectType,
  getReferenceObjectType,
  isRefObject,
} from "../utils.ts";

interface PropertyableNodeStructure {
  properties?: OptionalKind<PropertySignatureStructure>[];
}

const transformComponents = (components: ComponentsObject) => {
  const project = new Project();

  const morphSourceFile = project.createSourceFile("temp.ts", "", {
    overwrite: true,
  });

  if (components?.schemas) {
    for (const key of Object.keys(components.schemas)) {
      const schemaObject = components.schemas[key];

      if (schemaObject) {
        if (
          schemaObject.type === "object" ||
          ("properties" in schemaObject &&
            typeof schemaObject.properties === "object")
        ) {
          const interfaceDeclaration = morphSourceFile.addInterface({
            name: key,
            isExported: true,
          });

          if (schemaObject.properties) {
            for (const name of Object.keys(schemaObject.properties)) {
              const property = schemaObject.properties[name];

              if (property) {
                const propertySignature = interfaceDeclaration.addProperty({
                  name,
                  docs: [{ description: property.description }],
                });

                if (isRefObject(property)) {
                  propertySignature.setType(getReferenceObjectType(property));
                } else {
                  // propertySignature.setType(getObjectType(property) as any);
                  if (schemaObject.required) {
                    if (schemaObject.required.includes(name)) {
                      propertySignature.setHasQuestionToken(false);
                    } else {
                      propertySignature.setHasQuestionToken(true);
                    }
                  }
                }
              }
            }
          }
        }
        if (schemaObject.type === "array") {
          if (schemaObject.items) {
            const items = Array.isArray(schemaObject.items)
              ? schemaObject.items
              : [schemaObject.items];

            const types = items.map((v) => {
              return getObjectType(v);
            });

            morphSourceFile.addTypeAlias({
              name: key,
              type: types.join("|") + "[]",
            });
          }
        }
      }
    }
  }

  return morphSourceFile.getText();
};

export default transformComponents;

interface a {
  a: 1;
}

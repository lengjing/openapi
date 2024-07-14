import { Project } from "ts-morph";
import { ComponentsObject } from "../typing";
import {
  getReferenceObjectType,
  getSchemaObjectType,
  isRefObject,
} from "../utils.ts";

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
                try {
                  const propertySignature = interfaceDeclaration.addProperty({
                    name,
                    docs: [{ description: property.description }],
                  });

                  if (isRefObject(property)) {
                    propertySignature.setType(getReferenceObjectType(property));
                  } else {
                    propertySignature.setType(getSchemaObjectType(property));

                    if (schemaObject.required) {
                      if (!schemaObject.required.includes(name)) {
                        propertySignature.setHasQuestionToken(true);
                      }
                    }
                  }
                } catch (err) {}
              }
            }
          }
        }

        if (schemaObject.type === "array") {
          morphSourceFile.addTypeAlias({
            name: key,
            type: getSchemaObjectType(schemaObject),
            isExported: true,
          });
        }
      }
    }
  }

  return morphSourceFile.getText();
};

export default transformComponents;

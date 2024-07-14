import {
  OptionalKind,
  Project,
  InterfaceDeclarationStructure,
  PropertySignatureStructure,
} from "ts-morph";
import { ComponentsObject, SchemaObject } from "../typing";
import { addDocs, getDocs, getType, isRefObject } from "../utils";

interface PropertyableNodeStructure {
  properties?: OptionalKind<PropertySignatureStructure>[];
}

const addProperties = <T extends PropertyableNodeStructure>(
  struct: T,
  schemaObject: SchemaObject
) => {
  if (schemaObject.type === "object" && schemaObject.properties) {
    struct.properties = [];

    for (const name of Object.keys(schemaObject.properties)) {
      const property = schemaObject.properties[name];

      if (property) {
        const struct: OptionalKind<PropertySignatureStructure> = {
          name,
          type: getType(property),
          docs: isRefObject(property) ? undefined : getDocs(property),
        };

        struct.properties!.push(struct);
      }
    }
  }
};

const transformComponents = (components: ComponentsObject) => {
  const project = new Project();

  const morphSourceFile = project.createSourceFile("temp.ts", "", {
    overwrite: true,
  });

  if (components?.schemas) {
    for (const key of Object.keys(components.schemas)) {
      const schemaObject = components.schemas[key];

      if (schemaObject) {
        const struct: OptionalKind<InterfaceDeclarationStructure> = {
          name: key,
          isExported: true,
        };

        addDocs(struct, schemaObject);

        addProperties(struct, schemaObject);

        morphSourceFile.addInterface(struct);
      }
    }
  }

  return morphSourceFile;
};

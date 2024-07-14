import { JSDocStructure, OptionalKind } from "ts-morph";
import type {
  OperationObject,
  ParameterObject,
  ReferenceObject,
  ResponseObject,
  SchemaObject,
} from "./typing";

export const isRefObject = (
  object: Record<string, any>
): object is ReferenceObject => {
  return "$ref" in object ? true : false;
};

// export const addDocs = <T extends JSDocableNodeStructure>(
//   struct: T,
//   schemaObject: SchemaObject
// ) => {
//   const docs = getDocs(schemaObject);

//   if (docs) {
//     if (!struct.docs) {
//       struct.docs = [];
//     }

//     struct.docs = [...struct.docs, ...docs];
//   }
// };

// export const getDocs = (schemaObject: SchemaObject | OperationObject) => {
//   const docs: OptionalKind<JSDocStructure>[] = [];

//   if (schemaObject.description) {
//     docs.push({
//       description: schemaObject.description,
//       // tags: [{kind: }]
//     });
//   }

//   if (schemaObject.externalDocs) {
//     docs.push({
//       description: schemaObject.externalDocs.description,
//       tags: [{ tagName: "@See", text: schemaObject.externalDocs.url }],
//     });
//   }

//   return docs.length ? docs : undefined;
// };

export const getObjectType = (schemaObject: SchemaObject | ReferenceObject) => {
  if (isRefObject(schemaObject)) {
    return getReferenceObjectType(schemaObject);
  }

  if (schemaObject.type) {
    // primitives
    if (
      schemaObject.type === "string" ||
      schemaObject.type === "null" ||
      schemaObject.type === "boolean" ||
      schemaObject.type === "integer" ||
      schemaObject.type === "number"
    ) {
      return getPrimitiveType(schemaObject.type);
    }

    // type: array (with support for tuples)
    if (schemaObject.type === "array") {
      let itemType: any[] = [];
      if (schemaObject.prefixItems || Array.isArray(schemaObject.items)) {
        const prefixItems =
          schemaObject.prefixItems ??
          (schemaObject.items as (SchemaObject | ReferenceObject)[]);
        itemType = prefixItems.map((item) => getObjectType(item));
      } else if (schemaObject.items) {
        // if ("type" in schemaObject.items && schemaObject.items.type === "array") {
        //   itemType = getType(schemaObject.items);
        // } else {
        //   itemType = getType(schemaObject.items);
        // }
      }

      const min: number =
        typeof schemaObject.minItems === "number" && schemaObject.minItems >= 0
          ? schemaObject.minItems
          : 0;
      const max: number | undefined =
        typeof schemaObject.maxItems === "number" &&
        schemaObject.maxItems >= 0 &&
        min <= schemaObject.maxItems
          ? schemaObject.maxItems
          : undefined;
      const estimateCodeSize =
        typeof max !== "number" ? min : (max * (max + 1) - min * (min - 1)) / 2;
      if (
        (min !== 0 || max !== undefined) &&
        estimateCodeSize < 30 // "30" is an arbitrary number but roughly around when TS starts to struggle with tuple inference in practice
      ) {
        // if maxItems is set, then return a union of all permutations of possible tuple types
        if (schemaObject.maxItems! > 0) {
          const members: any[] = [];
          // populate 1 short of min …
          for (let i = 0; i <= (max ?? 0) - min; i++) {
            const elements: any[] = [];
            for (let j = min; j < i + min; j++) {
              elements.push(itemType);
            }
            members.push(elements);
          }
          return members;
        }
        // if maxItems not set, then return a simple tuple type the length of `min`
        else {
          const elements: any[] = [];
          for (let i = 0; i < min; i++) {
            elements.push(itemType);
          }
          elements.push(itemType);
          return elements;
        }
      }

      return JSON.stringify(itemType);
    }

    if (schemaObject.type === "object") {
    }

    // polymorphic, or 3.1 nullable
    if (Array.isArray(schemaObject.type) && !Array.isArray(schemaObject)) {
      // skip any primitive types that appear in oneOf as well
      const uniqueTypes: any[] = [];
      if (Array.isArray(schemaObject.oneOf)) {
        for (const t of schemaObject.type) {
          if (
            (t === "boolean" ||
              t === "string" ||
              t === "number" ||
              t === "integer" ||
              t === "null") &&
            schemaObject.oneOf.find(
              (o) => typeof o === "object" && "type" in o && o.type === t
            )
          ) {
            continue;
          }
          uniqueTypes.push(
            t === "null" || t === null
              ? "null"
              : getObjectType(
                  {
                    ...schemaObject,
                    type: t,
                    oneOf: undefined,
                  } as SchemaObject // don’t stack oneOf transforms
                )
          );
        }
      } else {
        for (const t of schemaObject.type) {
          if (t === "null" || t === null) {
            if (!schemaObject.default) {
              uniqueTypes.push("null");
            }
          } else {
            uniqueTypes.push(
              getObjectType({ ...schemaObject, type: t } as SchemaObject)
            );
          }
        }
      }
      return uniqueTypes.join("|");
    }
  }
};

const getPrimitiveType = (
  type: "null" | "string" | "number" | "integer" | "boolean"
) => {
  // type: null
  if (type === "null") {
    return "null";
  }
  // type: string
  if (type === "string") {
    return "string";
  }
  // type: number / type: integer
  if (type === "number" || type === "integer") {
    return "number";
  }
  // type: boolean
  if (type === "boolean") {
    return "boolean";
  }
};

export const getReferenceObjectType = (referenceObject: ReferenceObject) => {
  return referenceObject.$ref;
};

export const getParameterObjectType = (parameterObject: ParameterObject) => {
  if (parameterObject.schema) {
    return getObjectType(parameterObject.schema);
  }
};

export const getResponseObjectType = (responseObject: ResponseObject) => {
  // responseObject.
};

export const getOperationObjectDocs = (operationObject: OperationObject) => {
  let doc: OptionalKind<JSDocStructure> = {
    tags: [],
  };

  if (operationObject.summary) {
    doc.description = operationObject.summary;
  }

  if (operationObject.description) {
    doc.tags?.push({
      tagName: "description",
      text: operationObject.description,
    });
  }

  operationObject.parameters?.forEach((parameter) => {
    if (!isRefObject(parameter)) {
      if (parameter.name) {
        doc.tags?.push({
          tagName: "param",
          text: parameter.name + " " + parameter.description,
        });
      }
    }
  });

  const res200 = operationObject.responses?.["200"];

  if (res200) {
    if (!isRefObject(res200)) {
      doc.tags?.push({ tagName: "returns", text: res200.description });
    }
  }

  return doc;
};

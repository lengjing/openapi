import { parseRef } from "@redocly/openapi-core/lib/ref-utils.js";
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

export const getSchemaObjectType = (schemaObject: SchemaObject) => {
  if (schemaObject.type) {
    // primitives
    if (schemaObject.type === "string") {
      return "string";
    }

    if (schemaObject.type === "null") {
      return "null";
    }

    if (schemaObject.type === "boolean") {
      return "boolean";
    }

    if (schemaObject.type === "integer" || schemaObject.type === "number") {
      return "number";
    }

    // type: array
    if (schemaObject.type === "array") {
      let itemType = "unknown";
      if (schemaObject.prefixItems || Array.isArray(schemaObject.items)) {
        const prefixItems =
          schemaObject.prefixItems ??
          (schemaObject.items as (SchemaObject | ReferenceObject)[]);
        itemType = prefixItems
          .map((item) => {
            if (isRefObject(item)) {
              return getReferenceObjectType(item);
            } else {
              return getSchemaObjectType(item);
            }
          })
          .join(" | ");
      } else if (schemaObject.items) {
        if (isRefObject(schemaObject.items)) {
          itemType = getReferenceObjectType(schemaObject.items);
        } else {
          itemType = getSchemaObjectType(schemaObject.items);
        }
      }

      // const min: number =
      //   typeof schemaObject.minItems === "number" && schemaObject.minItems >= 0
      //     ? schemaObject.minItems
      //     : 0;
      // const max: number | undefined =
      //   typeof schemaObject.maxItems === "number" &&
      //   schemaObject.maxItems >= 0 &&
      //   min <= schemaObject.maxItems
      //     ? schemaObject.maxItems
      //     : undefined;
      // const estimateCodeSize =
      //   typeof max !== "number" ? min : (max * (max + 1) - min * (min - 1)) / 2;
      // if (
      //   (min !== 0 || max !== undefined) &&
      //   estimateCodeSize < 30 // "30" is an arbitrary number but roughly around when TS starts to struggle with tuple inference in practice
      // ) {
      //   // if maxItems is set, then return a union of all permutations of possible tuple types
      //   if (schemaObject.maxItems! > 0) {
      //     const members: any[] = [];
      //     // populate 1 short of min …
      //     for (let i = 0; i <= (max ?? 0) - min; i++) {
      //       const elements: any[] = [];
      //       for (let j = min; j < i + min; j++) {
      //         elements.push(itemType);
      //       }
      //       members.push(elements);
      //     }
      //     return members;
      //   }
      //   // if maxItems not set, then return a simple tuple type the length of `min`
      //   else {
      //     const elements: any[] = [];
      //     for (let i = 0; i < min; i++) {
      //       elements.push(itemType);
      //     }
      //     elements.push(itemType);
      //     return elements;
      //   }
      // }

      return itemType + "[]";
    }

    // type: object
    if (schemaObject.type === "object") {
      const objType: Record<string, any> = {};
      if (schemaObject.properties) {
        for (const name of Object.keys(schemaObject.properties)) {
          const property = schemaObject.properties[name];

          if (property) {
            objType[name] = isRefObject(property)
              ? getReferenceObjectType(property)
              : getSchemaObjectType(property);
          }
        }
      }
      return objectToString(objType);
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
              : getSchemaObjectType(
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
              getSchemaObjectType({ ...schemaObject, type: t } as SchemaObject)
            );
          }
        }
      }
      return uniqueTypes.join(" | ");
    }
  }

  return "unknown";
};

export const getReferenceObjectType = (referenceObject: ReferenceObject) => {
  const { pointer } = parseRef(referenceObject.$ref);

  return pointer.slice(2).reduce((a, b) => a + "['" + b + "']");
};

export const getParameterObjectType = (parameterObject: ParameterObject) => {
  if (parameterObject.schema) {
    return getSchemaObjectType(parameterObject.schema);
  }
};

export const getResponseObjectType = (responseObject: ResponseObject) => {
  if (responseObject.content) {
    for (const contentType of Object.keys(responseObject.content)) {
      const mediaTypeObject = responseObject.content[contentType];

      if (mediaTypeObject?.schema) {
        return isRefObject(mediaTypeObject.schema)
          ? getReferenceObjectType(mediaTypeObject.schema)
          : getSchemaObjectType(mediaTypeObject.schema);
      }
    }
  }
};

const isDocEmpty = (doc: OptionalKind<JSDocStructure>) => {
  return !doc.description && !doc.tags?.length ? true : false;
};

export const getSchemaObjectDoc = (schemaObject: SchemaObject) => {
  const doc: OptionalKind<JSDocStructure> = {
    description: "",
    tags: [],
  };

  if (schemaObject.description) {
    doc.tags!.push({
      tagName: "description",
      text: schemaObject.description,
    });
  }

  if (schemaObject.format) {
    doc.description += `format: ${schemaObject.format}`;
  }

  return isDocEmpty(doc) ? undefined : doc;
};

export const getOperationObjectDoc = (operationObject: OperationObject) => {
  let doc: OptionalKind<JSDocStructure> = {
    description: "",
    tags: [],
  };

  if (operationObject.summary) {
    doc.description += operationObject.summary;
  }

  if (operationObject.description) {
    doc.tags!.push({
      tagName: "description",
      text: operationObject.description,
    });
  }

  operationObject.parameters?.forEach((parameter) => {
    if (!isRefObject(parameter)) {
      if (parameter.name) {
        doc.tags!.push({
          tagName: "param",
          text: parameter.name + " " + parameter.description,
        });
      }
    }
  });

  const res200 = operationObject.responses?.["200"];

  if (res200) {
    if (!isRefObject(res200)) {
      doc.tags!.push({ tagName: "returns", text: res200.description });
    }
  }

  return isDocEmpty(doc) ? undefined : doc;
};

const objectToString = (
  obj: Record<string, any>,
  seen = new WeakSet(),
  indent = 0
) => {
  if (typeof obj !== "object" || obj === null) {
    return String(obj);
  }

  if (seen.has(obj)) {
    return "[Circular]";
  }

  seen.add(obj);

  let indentStr = " ".repeat(indent);
  let result;
  if (Array.isArray(obj)) {
    result = "[\n";
    for (let i = 0; i < obj.length; i++) {
      result +=
        indentStr + "  " + objectToString(obj[i], seen, indent + 2) + ",\n";
    }
    result += indentStr + "]";
  } else {
    result = "{\n";
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        result +=
          indentStr +
          "  " +
          key +
          ": " +
          objectToString(obj[key], seen, indent + 2) +
          ",\n";
      }
    }
    result += indentStr + "}";
  }
  return result;
};

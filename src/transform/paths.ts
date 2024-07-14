import { Project, Scope } from "ts-morph";
import type { PathsObject } from "../typing";
import {
  getOperationObjectDocs,
  getParameterObjectType,
  getReferenceObjectType,
  isRefObject,
} from "../utils.ts";

export type Method =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace";

const methods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as Method[];

const transformPaths = (paths: PathsObject) => {
  const resources = Object.keys(paths);

  const project = new Project();

  const morphSourceFile = project.createSourceFile("temp.ts", "", {
    overwrite: true,
  });

  morphSourceFile.addInterface({
    name: "Meta",
    properties: [{ name: "endpoint", type: "string" }],
    isExported: true,
  });

  const classDeclaration = morphSourceFile.addClass({
    name: "Client",
    isExported: true,
    ctors: [
      {
        parameters: [
          {
            name: "meta",
            type: "Meta",
            scope: Scope.Private,
          },
          {
            name: "request",
            initializer: "fetch",
            scope: Scope.Private,
          },
        ],
      },
    ],
  });

  for (let resource of resources) {
    const pathItemObject = paths[resource];
    if (!pathItemObject) continue;
    if (isRefObject(pathItemObject)) {
      // todo:
    } else {
      for (const method of methods) {
        const operationObject = pathItemObject[method];

        if (!operationObject) continue;
        if (isRefObject(operationObject)) {
          // todo:
        } else if (operationObject.operationId) {
          classDeclaration.addMethod({
            name: operationObject.operationId,
            parameters: [
              {
                name: "init",
                type: (block) => {
                  const params = operationObject.parameters?.map((obj) => {
                    if (isRefObject(obj)) {
                      return getReferenceObjectType(obj);
                    } else {
                      return getParameterObjectType(obj);
                    }
                  });

                  block.write(`{params: ${JSON.stringify(params)}}`);
                },
              },
            ],
            statements: (block) => {
              block.write(
                `return this.request(this.meta.endpoint, {method: '${method}', ...init})`
              );
            },
            docs: [getOperationObjectDocs(operationObject)],
          });
        }
      }
    }
  }

  // return type;
  return morphSourceFile.getText();
};

export default transformPaths;

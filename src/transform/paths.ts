import type { PathsObject } from "../typing";
import {
  getParameterObjectType,
  isRefObject,
  getFunctionDocs,
} from "../utils.ts";
import { Project, Scope } from "ts-morph";

export type Method =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace";

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
        ]
      },
    ],
  });

  for (let resource of resources) {
    const obj = paths[resource];
    if (!obj) continue;
    if (isRefObject(obj)) {
      // todo:
    } else {
      const pathItemObject = obj;
      for (const method of [
        "get",
        "put",
        "post",
        "delete",
        "options",
        "head",
        "patch",
        "trace",
      ] as Method[]) {
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
                      return obj.$ref;
                    } else {
                      getParameterObjectType(obj);
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
            docs: [getFunctionDocs(operationObject)]
          });
        }
      }
    }
  }

  // return type;
  return morphSourceFile.getText();
};

export default transformPaths;

import { Project, Scope } from "ts-morph";
import type { PathsObject } from "../typing";
import {
  getOperationObjectDoc,
  getParameterObjectType,
  getReferenceObjectType,
  getResponseObjectType,
  isRefObject,
} from "../utils.ts";

export type Method = typeof methods[number];

const methods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

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
          const methodDeclration = classDeclaration.addMethod({
            name: operationObject.operationId,
            parameters: [
              {
                name: "init",
                type: (block) => {
                  const params = operationObject.parameters?.map(
                    (parameter) => {
                      if (isRefObject(parameter)) {
                        return getReferenceObjectType(parameter);
                      } else {
                        return getParameterObjectType(parameter);
                      }
                    }
                  );

                  block.write(`{params: ${JSON.stringify(params)}}`);
                },
              },
            ],
            statements: (block) => {
              block.write(
                `return this.request(this.meta.endpoint, {method: '${method}', ...init})`
              );
            },
          });

          const res200 = operationObject.responses?.["200"];
          if (res200) {
            const returnType = isRefObject(res200)
              ? getReferenceObjectType(res200)
              : getResponseObjectType(res200);

            if (returnType) {
              methodDeclration.setReturnType(returnType);
            }
          }

          const doc = getOperationObjectDoc(operationObject);
          if (doc) {
            methodDeclration.addJsDoc(doc);
          }
        }
      }
    }
  }

  morphSourceFile.addImportDeclaration({
    "namedImports": [{"name": 'a'}],
    "moduleSpecifier": './a'
  })

  return morphSourceFile.getText();
};

export default transformPaths;

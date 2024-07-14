import {
  BaseResolver,
  bundle,
  createConfig,
  lintDocument,
  makeDocumentFromString,
  Source,
  type Document,
  type Config as RedoclyConfig,
} from "@redocly/openapi-core";
import { writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import parseJson from "parse-json";
import transformComponents from "./transform/components.ts";
import type { OpenAPI3 } from "./typing";
import transformPaths from "./transform/paths.ts";

const openapiTS = async (
  source: string | URL | OpenAPI3 | Buffer | Readable
) => {
  const redoc = await createConfig(
    {
      rules: {
        "operation-operationId-unique": { severity: "error" }, // throw error on duplicate operationIDs
      },
    },
    { extends: ["minimal"] }
  );

  const schema = await validateAndBundle(source, { redoc, silent: false });

  console.log(schema);

  // const a = transform(schema);

  // const str = astToString(a);

  // console.log(a);
  // const a = generateDefination(schema);

  // const a = transformPaths(schema.paths)
  const a = transformComponents(schema.components)

  writeFileSync('./b.ts', a);

  // const ctx = {
  //   additionalProperties: options.additionalProperties ?? false,
  //   alphabetize: options.alphabetize ?? false,
  //   arrayLength: options.arrayLength ?? false,
  //   defaultNonNullable: options.defaultNonNullable ?? true,
  //   discriminators: scanDiscriminators(schema, options),
  //   emptyObjectsUnknown: options.emptyObjectsUnknown ?? false,
  //   enum: options.enum ?? false,
  //   enumValues: options.enumValues ?? false,
  //   excludeDeprecated: options.excludeDeprecated ?? false,
  //   exportType: options.exportType ?? false,
  //   immutable: options.immutable ?? false,
  //   injectFooter: [],
  //   pathParamsAsTypes: options.pathParamsAsTypes ?? false,
  //   postTransform: typeof options.postTransform === "function" ? options.postTransform : undefined,
  //   propertiesRequiredByDefault: options.propertiesRequiredByDefault ?? false,
  //   redoc,
  //   silent: options.silent ?? false,
  //   transform: typeof options.transform === "function" ? options.transform : undefined,
  //   resolve($ref) {
  //     return resolveRef(schema, $ref, { silent: options.silent ?? false });
  //   },
  // };

  // const transformT = performance.now();
  // const result = transformSchema(schema, ctx);
  // debug("Completed AST transformation for entire document", "ts", performance.now() - transformT);

  // return result;
};

export type ParseSchemaOptions = {
  absoluteRef: string;
  resolver: BaseResolver;
};
export async function parseSchema(
  schema: unknown,
  { absoluteRef, resolver }: ParseSchemaOptions
): Promise<Document> {
  if (!schema) {
    throw new Error("Can't parse empty schema");
  }
  if (schema instanceof URL) {
    const result = await resolver.resolveDocument(null, absoluteRef, true);
    if ("parsed" in result) {
      return result;
    }
    throw result.originalError;
  }
  if (schema instanceof Readable) {
    const contents = await new Promise<string>((resolve) => {
      schema.resume();
      schema.setEncoding("utf8");
      let content = "";
      schema.on("data", (chunk: string) => {
        content += chunk;
      });
      schema.on("end", () => {
        resolve(content.trim());
      });
    });
    return parseSchema(contents, { absoluteRef, resolver });
  }
  if (schema instanceof Buffer) {
    return parseSchema(schema.toString("utf8"), { absoluteRef, resolver });
  }
  if (typeof schema === "string") {
    // URL
    if (
      schema.startsWith("http://") ||
      schema.startsWith("https://") ||
      schema.startsWith("file://")
    ) {
      const url = new URL(schema);
      return parseSchema(url, {
        absoluteRef: url.protocol === "file:" ? fileURLToPath(url) : url.href,
        resolver,
      });
    }
    // JSON
    if (schema[0] === "{") {
      return {
        source: new Source(absoluteRef, schema, "application/json"),
        parsed: parseJson(schema),
      };
    }
    // YAML
    return makeDocumentFromString(schema, absoluteRef);
  }
  if (typeof schema === "object" && !Array.isArray(schema)) {
    return {
      source: new Source(
        absoluteRef,
        JSON.stringify(schema),
        "application/json"
      ),
      parsed: schema,
    };
  }
  throw new Error(
    `Expected string, object, or Buffer. Got ${
      Array.isArray(schema) ? "Array" : typeof schema
    }`
  );
}

export type ValidateAndBundleOptions = {
  redoc: RedoclyConfig;
  silent: boolean;
  cwd?: URL;
};
export async function validateAndBundle(
  source: string | URL | OpenAPI3 | Readable | Buffer,
  options: ValidateAndBundleOptions
) {
  // const redocConfigT = performance.now();
  // debug("Loaded Redoc config", "redoc", performance.now() - redocConfigT);
  // const redocParseT = performance.now();
  let absoluteRef = fileURLToPath(
    new URL(options?.cwd ?? `file://${process.cwd()}/`)
  );
  if (source instanceof URL) {
    absoluteRef =
      source.protocol === "file:" ? fileURLToPath(source) : source.href;
  }
  const resolver = new BaseResolver(options.redoc.resolve);
  const document = await parseSchema(source, {
    absoluteRef,
    resolver,
  });
  // debug("Parsed schema", "redoc", performance.now() - redocParseT);

  // 1. check for OpenAPI 3 or greater
  const openapiVersion = Number.parseFloat(document.parsed.openapi);
  if (
    document.parsed.swagger ||
    !document.parsed.openapi ||
    Number.isNaN(openapiVersion) ||
    openapiVersion < 3 ||
    openapiVersion >= 4
  ) {
    if (document.parsed.swagger) {
      throw new Error(
        "Unsupported Swagger version: 2.x. Use OpenAPI 3.x instead."
      );
    }
    if (document.parsed.openapi || openapiVersion < 3 || openapiVersion >= 4) {
      throw new Error(
        `Unsupported OpenAPI version: ${document.parsed.openapi}`
      );
    }
    throw new Error("Unsupported schema format, expected `openapi: 3.x`");
  }

  // 2. lint
  // const redocLintT = performance.now();
  const problems = await lintDocument({
    document,
    config: options.redoc.styleguide,
    externalRefResolver: resolver,
  });
  if (problems.length) {
    let errorMessage: string | undefined = undefined;
    for (const problem of problems) {
      if (problem.severity === "error") {
        errorMessage = problem.message;
        console.error(problem.message);
      } else {
        console.warn(problem.message, options.silent);
      }
    }
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  }
  // debug("Linted schema", "lint", performance.now() - redocLintT);

  // 3. bundle
  // const redocBundleT = performance.now();
  const bundled = await bundle({
    config: options.redoc,
    dereference: false,
    doc: document,
  });
  if (bundled.problems.length) {
    let errorMessage: string | undefined = undefined;
    for (const problem of bundled.problems) {
      if (problem.severity === "error") {
        errorMessage = problem.message;
        console.error(problem.message);
        throw new Error(problem.message);
      } else {
        console.warn(problem.message, options.silent);
      }
    }
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  }
  // debug("Bundled schema", "bundle", performance.now() - redocBundleT);

  return bundled.bundle.parsed;
}

// const file = readFileSync(resolve("./examples/sample.yaml"), 'utf-8')
const file = new URL("../examples/a.yaml", import.meta.url);
// const ast = await openapi(file);
// const str = astToString(ast);
// console.log(str);
// writeFileSync("./my-schema.ts", str);

openapiTS(file);

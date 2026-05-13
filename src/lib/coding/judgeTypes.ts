export type CodingLanguage =
  | "java"
  | "cpp"
  | "javascript"
  | "python"
  | "go";

export type CodingValueType =
  | "int"
  | "boolean"
  | "string"
  | "int[]"
  | "string[]"
  | "int[][]";

export type CodingParameterDefinition = {
  name: string;
  type: CodingValueType;
};

export type CodingExample = {
  inputText: string;
  outputText: string;
  explanation?: string;
};

export type CodingTestCase = {
  input: unknown[];
  expected: unknown;
  hidden?: boolean;
};

export type CodingProblemDefinition = {
  id: string;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  prompt: string;
  constraints: string[];
  examples: CodingExample[];
  starterByLanguage: Record<CodingLanguage, string>;
  functionNameByLanguage: Record<CodingLanguage, string>;
  parameters: CodingParameterDefinition[];
  returnType: CodingValueType;
  testCases: CodingTestCase[];
  tags?: string[];
  order?: number;
};

export type CodingRunResult = {
  compileStatus: "success" | "error" | "timeout";
  runStatus: "passed" | "failed" | "runtime_error" | "compile_error" | "timeout";
  stdout: string;
  stderr: string;
  passedCount: number;
  totalCount: number;
  failedCases: Array<{
    index: number;
    input: unknown[];
    expected: unknown;
    actual?: unknown;
    stderr?: string;
  }>;
  timeMs: number;
  memoryKb: number;
  sampleResults: Array<{
    index: number;
    passed: boolean;
    hidden: boolean;
    actual?: unknown;
    expected?: unknown;
  }>;
};

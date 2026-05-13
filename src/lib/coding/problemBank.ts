import type {
  CodingExample,
  CodingLanguage,
  CodingProblemDefinition,
} from "@/lib/coding/judgeTypes";

export const SUPPORTED_CODING_LANGUAGES: CodingLanguage[] = [
  "java",
  "cpp",
  "javascript",
  "python",
  "go",
];

export const DEFAULT_CODING_LANGUAGE: CodingLanguage = "java";
export const DEFAULT_CODING_DURATION_MINUTES = 35;

/**
 * 将语言代码映射为 UI 可读标签。
 * @param language 当前语言值。
 * @returns 对应展示名称。
 */
export function getCodingLanguageLabel(language: CodingLanguage): string {
  switch (language) {
    case "java":
      return "Java";
    case "cpp":
      return "C++";
    case "javascript":
      return "JavaScript";
    case "python":
      return "Python";
    case "go":
      return "Go";
    default:
      return language;
  }
}

function renderExamples(examples: CodingExample[]): string {
  return examples
    .map((example, index) => {
      const explanationText = example.explanation
        ? `\n解释：${example.explanation}`
        : "";
      return [
        `示例 ${index + 1}:`,
        `输入：${example.inputText}`,
        `输出：${example.outputText}${explanationText}`,
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * 将题库定义转成题面正文。
 * @param problem 当前题目。
 * @returns 可直接展示给候选人的题面。
 */
export function buildCodingProblemPrompt(problem: CodingProblemDefinition): string {
  return [
    problem.prompt,
    "",
    "示例：",
    renderExamples(problem.examples),
    "",
    "约束：",
    ...problem.constraints.map((item) => `- ${item}`),
  ].join("\n");
}

function buildStarterByLanguage(input: {
  java: string;
  cpp: string;
  javascript: string;
  python: string;
  go: string;
}): Record<CodingLanguage, string> {
  return input;
}

export const CODING_TOP_PROBLEMS: CodingProblemDefinition[] = [
  {
    id: "top200-0001",
    slug: "two-sum",
    title: "1. 两数之和",
    difficulty: "Easy",
    prompt:
      "给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值 target 的那两个整数，并返回它们的数组下标。你可以假设每种输入只会对应一个答案，且同一个元素不能使用两次。",
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i], target <= 10^9",
      "返回任意一组合法下标即可",
    ],
    examples: [
      {
        inputText: "nums = [2,7,11,15], target = 9",
        outputText: "[0,1]",
        explanation: "因为 nums[0] + nums[1] == 9",
      },
    ],
    parameters: [
      { name: "nums", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returnType: "int[]",
    functionNameByLanguage: {
      java: "twoSum",
      cpp: "twoSum",
      javascript: "twoSum",
      python: "twoSum",
      go: "twoSum",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        return new int[0];\n    }\n}\n`,
      cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        return {};\n    }\n};\n`,
      javascript: `function twoSum(nums, target) {\n  return [];\n}\n\nmodule.exports = twoSum;\n`,
      python: `class Solution:\n    def twoSum(self, nums, target):\n        return []\n`,
      go: `package main\n\nfunc twoSum(nums []int, target int) []int {\n    return []int{}\n}\n`,
    }),
    testCases: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { input: [[3, 2, 4], 6], expected: [1, 2] },
      { input: [[3, 3], 6], expected: [0, 1], hidden: true },
    ],
    tags: ["数组", "哈希表"],
    order: 1,
  },
  {
    id: "top200-0002",
    slug: "best-time-to-buy-and-sell-stock",
    title: "121. 买卖股票的最佳时机",
    difficulty: "Easy",
    prompt:
      "给定一个数组 prices，它的第 i 个元素 prices[i] 表示一支给定股票第 i 天的价格。你只能选择某一天买入这只股票，并选择在未来的某一个不同的日子卖出。设计一个算法来计算你所能获取的最大利润；如果你不能获取任何利润，返回 0。",
    constraints: [
      "1 <= prices.length <= 10^5",
      "0 <= prices[i] <= 10^4",
    ],
    examples: [
      {
        inputText: "prices = [7,1,5,3,6,4]",
        outputText: "5",
        explanation: "在第 2 天买入，在第 5 天卖出，利润最大为 5",
      },
    ],
    parameters: [{ name: "prices", type: "int[]" }],
    returnType: "int",
    functionNameByLanguage: {
      java: "maxProfit",
      cpp: "maxProfit",
      javascript: "maxProfit",
      python: "maxProfit",
      go: "maxProfit",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public int maxProfit(int[] prices) {\n        return 0;\n    }\n}\n`,
      cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    int maxProfit(vector<int>& prices) {\n        return 0;\n    }\n};\n`,
      javascript: `function maxProfit(prices) {\n  return 0;\n}\n\nmodule.exports = maxProfit;\n`,
      python: `class Solution:\n    def maxProfit(self, prices):\n        return 0\n`,
      go: `package main\n\nfunc maxProfit(prices []int) int {\n    return 0\n}\n`,
    }),
    testCases: [
      { input: [[7, 1, 5, 3, 6, 4]], expected: 5 },
      { input: [[7, 6, 4, 3, 1]], expected: 0 },
      { input: [[2, 4, 1]], expected: 2, hidden: true },
    ],
    tags: ["数组", "动态规划"],
    order: 2,
  },
  {
    id: "top200-0003",
    slug: "contains-duplicate",
    title: "217. 存在重复元素",
    difficulty: "Easy",
    prompt:
      "给你一个整数数组 nums。如果任一值在数组中出现至少两次，返回 true；如果数组中每个元素互不相同，返回 false。",
    constraints: [
      "1 <= nums.length <= 10^5",
      "-10^9 <= nums[i] <= 10^9",
    ],
    examples: [
      { inputText: "nums = [1,2,3,1]", outputText: "true" },
    ],
    parameters: [{ name: "nums", type: "int[]" }],
    returnType: "boolean",
    functionNameByLanguage: {
      java: "containsDuplicate",
      cpp: "containsDuplicate",
      javascript: "containsDuplicate",
      python: "containsDuplicate",
      go: "containsDuplicate",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public boolean containsDuplicate(int[] nums) {\n        return false;\n    }\n}\n`,
      cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    bool containsDuplicate(vector<int>& nums) {\n        return false;\n    }\n};\n`,
      javascript: `function containsDuplicate(nums) {\n  return false;\n}\n\nmodule.exports = containsDuplicate;\n`,
      python: `class Solution:\n    def containsDuplicate(self, nums):\n        return False\n`,
      go: `package main\n\nfunc containsDuplicate(nums []int) bool {\n    return false\n}\n`,
    }),
    testCases: [
      { input: [[1, 2, 3, 1]], expected: true },
      { input: [[1, 2, 3, 4]], expected: false },
      { input: [[1, 1, 1, 3, 3, 4, 3, 2, 4, 2]], expected: true, hidden: true },
    ],
    tags: ["数组", "哈希表"],
    order: 3,
  },
  {
    id: "top200-0004",
    slug: "valid-parentheses",
    title: "20. 有效的括号",
    difficulty: "Easy",
    prompt:
      "给定一个只包括 '('、')'、'{'、'}'、'['、']' 的字符串 s，判断字符串是否有效。有效字符串需满足左括号必须用相同类型的右括号闭合，且左括号必须以正确的顺序闭合。",
    constraints: [
      "1 <= s.length <= 10^4",
      "s 仅由括号字符组成",
    ],
    examples: [
      { inputText: 's = "()[]{}"', outputText: "true" },
    ],
    parameters: [{ name: "s", type: "string" }],
    returnType: "boolean",
    functionNameByLanguage: {
      java: "isValid",
      cpp: "isValid",
      javascript: "isValid",
      python: "isValid",
      go: "isValid",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public boolean isValid(String s) {\n        return false;\n    }\n}\n`,
      cpp: `#include <string>\nusing namespace std;\n\nclass Solution {\npublic:\n    bool isValid(string s) {\n        return false;\n    }\n};\n`,
      javascript: `function isValid(s) {\n  return false;\n}\n\nmodule.exports = isValid;\n`,
      python: `class Solution:\n    def isValid(self, s):\n        return False\n`,
      go: `package main\n\nfunc isValid(s string) bool {\n    return false\n}\n`,
    }),
    testCases: [
      { input: ["()"], expected: true },
      { input: ["(]"], expected: false },
      { input: ["([{}])"], expected: true, hidden: true },
    ],
    tags: ["栈", "字符串"],
    order: 4,
  },
  {
    id: "top200-0005",
    slug: "maximum-subarray",
    title: "53. 最大子数组和",
    difficulty: "Medium",
    prompt:
      "给你一个整数数组 nums，请你找出一个具有最大和的连续子数组，并返回其最大和。",
    constraints: [
      "1 <= nums.length <= 10^5",
      "-10^4 <= nums[i] <= 10^4",
    ],
    examples: [
      {
        inputText: "nums = [-2,1,-3,4,-1,2,1,-5,4]",
        outputText: "6",
        explanation: "连续子数组 [4,-1,2,1] 的和最大，为 6",
      },
    ],
    parameters: [{ name: "nums", type: "int[]" }],
    returnType: "int",
    functionNameByLanguage: {
      java: "maxSubArray",
      cpp: "maxSubArray",
      javascript: "maxSubArray",
      python: "maxSubArray",
      go: "maxSubArray",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public int maxSubArray(int[] nums) {\n        return 0;\n    }\n}\n`,
      cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    int maxSubArray(vector<int>& nums) {\n        return 0;\n    }\n};\n`,
      javascript: `function maxSubArray(nums) {\n  return 0;\n}\n\nmodule.exports = maxSubArray;\n`,
      python: `class Solution:\n    def maxSubArray(self, nums):\n        return 0\n`,
      go: `package main\n\nfunc maxSubArray(nums []int) int {\n    return 0\n}\n`,
    }),
    testCases: [
      { input: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
      { input: [[1]], expected: 1 },
      { input: [[5, 4, -1, 7, 8]], expected: 23, hidden: true },
    ],
    tags: ["数组", "动态规划"],
    order: 5,
  },
  {
    id: "top200-0006",
    slug: "product-of-array-except-self",
    title: "238. 除自身以外数组的乘积",
    difficulty: "Medium",
    prompt:
      "给你一个整数数组 nums，返回数组 answer，其中 answer[i] 等于 nums 中除 nums[i] 之外其余各元素的乘积。题目保证数组任意前缀或后缀的乘积都在 32 位整数范围内。请不要使用除法，并在 O(n) 时间复杂度内完成。",
    constraints: [
      "2 <= nums.length <= 10^5",
      "-30 <= nums[i] <= 30",
    ],
    examples: [
      { inputText: "nums = [1,2,3,4]", outputText: "[24,12,8,6]" },
    ],
    parameters: [{ name: "nums", type: "int[]" }],
    returnType: "int[]",
    functionNameByLanguage: {
      java: "productExceptSelf",
      cpp: "productExceptSelf",
      javascript: "productExceptSelf",
      python: "productExceptSelf",
      go: "productExceptSelf",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public int[] productExceptSelf(int[] nums) {\n        return new int[0];\n    }\n}\n`,
      cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> productExceptSelf(vector<int>& nums) {\n        return {};\n    }\n};\n`,
      javascript: `function productExceptSelf(nums) {\n  return [];\n}\n\nmodule.exports = productExceptSelf;\n`,
      python: `class Solution:\n    def productExceptSelf(self, nums):\n        return []\n`,
      go: `package main\n\nfunc productExceptSelf(nums []int) []int {\n    return []int{}\n}\n`,
    }),
    testCases: [
      { input: [[1, 2, 3, 4]], expected: [24, 12, 8, 6] },
      { input: [[-1, 1, 0, -3, 3]], expected: [0, 0, 9, 0, 0] },
      { input: [[2, 3, 4, 5]], expected: [60, 40, 30, 24], hidden: true },
    ],
    tags: ["数组", "前缀和"],
    order: 6,
  },
  {
    id: "top200-0007",
    slug: "longest-substring-without-repeating-characters",
    title: "3. 无重复字符的最长子串",
    difficulty: "Medium",
    prompt:
      "给定一个字符串 s，请你找出其中不含有重复字符的最长子串的长度。",
    constraints: [
      "0 <= s.length <= 5 * 10^4",
      "s 由英文字母、数字、符号和空格组成",
    ],
    examples: [
      { inputText: 's = "abcabcbb"', outputText: "3" },
    ],
    parameters: [{ name: "s", type: "string" }],
    returnType: "int",
    functionNameByLanguage: {
      java: "lengthOfLongestSubstring",
      cpp: "lengthOfLongestSubstring",
      javascript: "lengthOfLongestSubstring",
      python: "lengthOfLongestSubstring",
      go: "lengthOfLongestSubstring",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public int lengthOfLongestSubstring(String s) {\n        return 0;\n    }\n}\n`,
      cpp: `#include <string>\nusing namespace std;\n\nclass Solution {\npublic:\n    int lengthOfLongestSubstring(string s) {\n        return 0;\n    }\n};\n`,
      javascript: `function lengthOfLongestSubstring(s) {\n  return 0;\n}\n\nmodule.exports = lengthOfLongestSubstring;\n`,
      python: `class Solution:\n    def lengthOfLongestSubstring(self, s):\n        return 0\n`,
      go: `package main\n\nfunc lengthOfLongestSubstring(s string) int {\n    return 0\n}\n`,
    }),
    testCases: [
      { input: ["abcabcbb"], expected: 3 },
      { input: ["bbbbb"], expected: 1 },
      { input: ["pwwkew"], expected: 3, hidden: true },
    ],
    tags: ["字符串", "滑动窗口"],
    order: 7,
  },
  {
    id: "top200-0008",
    slug: "search-in-rotated-sorted-array",
    title: "33. 搜索旋转排序数组",
    difficulty: "Medium",
    prompt:
      "整数数组 nums 按升序排列，数组中的值互不相同。在传递给函数之前，nums 会在预先未知的某个下标 k 上进行了旋转。请你在时间复杂度 O(log n) 内设计一个算法，判断 target 是否存在于数组中；如果存在，返回它的下标，否则返回 -1。",
    constraints: [
      "1 <= nums.length <= 5000",
      "-10^4 <= nums[i], target <= 10^4",
    ],
    examples: [
      { inputText: "nums = [4,5,6,7,0,1,2], target = 0", outputText: "4" },
    ],
    parameters: [
      { name: "nums", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returnType: "int",
    functionNameByLanguage: {
      java: "search",
      cpp: "search",
      javascript: "search",
      python: "search",
      go: "search",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public int search(int[] nums, int target) {\n        return -1;\n    }\n}\n`,
      cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    int search(vector<int>& nums, int target) {\n        return -1;\n    }\n};\n`,
      javascript: `function search(nums, target) {\n  return -1;\n}\n\nmodule.exports = search;\n`,
      python: `class Solution:\n    def search(self, nums, target):\n        return -1\n`,
      go: `package main\n\nfunc search(nums []int, target int) int {\n    return -1\n}\n`,
    }),
    testCases: [
      { input: [[4, 5, 6, 7, 0, 1, 2], 0], expected: 4 },
      { input: [[4, 5, 6, 7, 0, 1, 2], 3], expected: -1 },
      { input: [[1], 0], expected: -1, hidden: true },
    ],
    tags: ["数组", "二分查找"],
    order: 8,
  },
  {
    id: "top200-0009",
    slug: "merge-intervals",
    title: "56. 合并区间",
    difficulty: "Medium",
    prompt:
      "以数组 intervals 表示若干个区间的集合，其中单个区间为 intervals[i] = [starti, endi]。请你合并所有重叠的区间，并返回一个不重叠的区间数组，该数组需要恰好覆盖输入中的所有区间。",
    constraints: [
      "1 <= intervals.length <= 10^4",
      "intervals[i].length == 2",
      "0 <= starti <= endi <= 10^4",
    ],
    examples: [
      {
        inputText: "intervals = [[1,3],[2,6],[8,10],[15,18]]",
        outputText: "[[1,6],[8,10],[15,18]]",
      },
    ],
    parameters: [{ name: "intervals", type: "int[][]" }],
    returnType: "int[][]",
    functionNameByLanguage: {
      java: "merge",
      cpp: "merge",
      javascript: "merge",
      python: "merge",
      go: "merge",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `import java.util.*;\n\nclass Solution {\n    public int[][] merge(int[][] intervals) {\n        return new int[0][0];\n    }\n}\n`,
      cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<vector<int>> merge(vector<vector<int>>& intervals) {\n        return {};\n    }\n};\n`,
      javascript: `function merge(intervals) {\n  return [];\n}\n\nmodule.exports = merge;\n`,
      python: `class Solution:\n    def merge(self, intervals):\n        return []\n`,
      go: `package main\n\nfunc merge(intervals [][]int) [][]int {\n    return [][]int{}\n}\n`,
    }),
    testCases: [
      { input: [[[1, 3], [2, 6], [8, 10], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
      { input: [[[1, 4], [4, 5]]], expected: [[1, 5]] },
      { input: [[[1, 4], [0, 2], [3, 5]]], expected: [[0, 5]], hidden: true },
    ],
    tags: ["数组", "排序"],
    order: 9,
  },
  {
    id: "top200-0010",
    slug: "find-minimum-in-rotated-sorted-array",
    title: "153. 寻找旋转排序数组中的最小值",
    difficulty: "Medium",
    prompt:
      "已知一个长度为 n 的数组，预先按照升序排列，经 1 到 n 次旋转后，得到输入数组 nums。请你找出并返回数组中的最小元素。你必须设计一个时间复杂度为 O(log n) 的算法解决此问题。",
    constraints: [
      "1 <= n <= 5000",
      "-5000 <= nums[i] <= 5000",
      "nums 中所有整数互不相同",
    ],
    examples: [
      { inputText: "nums = [3,4,5,1,2]", outputText: "1" },
    ],
    parameters: [{ name: "nums", type: "int[]" }],
    returnType: "int",
    functionNameByLanguage: {
      java: "findMin",
      cpp: "findMin",
      javascript: "findMin",
      python: "findMin",
      go: "findMin",
    },
    starterByLanguage: buildStarterByLanguage({
      java: `class Solution {\n    public int findMin(int[] nums) {\n        return 0;\n    }\n}\n`,
      cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    int findMin(vector<int>& nums) {\n        return 0;\n    }\n};\n`,
      javascript: `function findMin(nums) {\n  return 0;\n}\n\nmodule.exports = findMin;\n`,
      python: `class Solution:\n    def findMin(self, nums):\n        return 0\n`,
      go: `package main\n\nfunc findMin(nums []int) int {\n    return 0\n}\n`,
    }),
    testCases: [
      { input: [[3, 4, 5, 1, 2]], expected: 1 },
      { input: [[4, 5, 6, 7, 0, 1, 2]], expected: 0 },
      { input: [[11, 13, 15, 17]], expected: 11, hidden: true },
    ],
    tags: ["数组", "二分查找"],
    order: 10,
  },
];

/**
 * 通过稳定哈希将同一轮次映射到固定题目，确保刷新后仍能恢复同一题。
 * @param seed 当前轮次或计划标识。
 * @returns 对应题目。
 */
export function selectCodingProblemBySeed(seed: string): CodingProblemDefinition {
  const normalizedSeed = seed.trim() || "default-round";
  let hash = 0;
  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash = (hash * 31 + normalizedSeed.charCodeAt(index)) >>> 0;
  }

  return CODING_TOP_PROBLEMS[hash % CODING_TOP_PROBLEMS.length];
}

/**
 * 通过题目标识读取题库定义。
 * @param problemId 题目 ID 或 slug。
 * @returns 匹配到的题目；不存在时返回 `null`。
 */
export function findCodingProblem(problemId: string): CodingProblemDefinition | null {
  const normalizedProblemId = problemId.trim();
  return (
    CODING_TOP_PROBLEMS.find(
      (item) => item.id === normalizedProblemId || item.slug === normalizedProblemId
    ) || null
  );
}

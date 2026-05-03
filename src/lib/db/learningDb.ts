import fs from 'fs';
import path from 'path';

export type QuickFact = {
  k: string;
  v: string;
};

export type ContentSection = {
  id: string;
  h2: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: string;
};

export type TopicContent = {
  title: string;
  breadcrumb: string[];
  quickFacts: QuickFact[];
  sections: ContentSection[];
};

export type DraftSummary = {
  topic: string;
  content: {
    quickFacts?: QuickFact[];
    sections?: ContentSection[];
  };
};

export type DraftRecord = {
  id: string;
  kbId: string;
  subject: string;
  summary: DraftSummary;
  createdAt: string;
  updatedAt: string;
};

export type TreeNode = {
  id: string;
  title: string;
  children?: TreeNode[];
};

export type TreeGroup = {
  id: string;
  title: string;
  children: TreeNode[];
};

export type TreeData = {
  id: string;
  title: string;
  groups: TreeGroup[];
};

export type KbInfo = {
  id: string;
  name: string;
  subtitle: string;
  tags: string[];
  updatedAt: string;
  stats: { topics: number; paths: number };
};

export type LearningDatabase = {
  kbs: KbInfo[];
  trees: Record<string, TreeData>;
  contents: Record<string, Record<string, TopicContent>>;
  drafts: Record<string, Record<string, DraftRecord>>;
};

const DB_PATH = path.join(process.cwd(), 'data', 'learning-center.json');

export const learningDb = {
  _init() {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      const initialData: LearningDatabase = {
        kbs: [],
        trees: {},
        contents: {},
        drafts: {}
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
    }
  },

  _read(): LearningDatabase {
    this._init();
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    try {
      const parsed = JSON.parse(data) as Partial<LearningDatabase>;
      const normalized: LearningDatabase = {
        kbs: Array.isArray(parsed.kbs) ? (parsed.kbs as KbInfo[]) : [],
        trees: parsed.trees && typeof parsed.trees === "object" ? (parsed.trees as Record<string, TreeData>) : {},
        contents:
          parsed.contents && typeof parsed.contents === "object"
            ? (parsed.contents as Record<string, Record<string, TopicContent>>)
            : {},
        drafts:
          parsed.drafts && typeof parsed.drafts === "object"
            ? (parsed.drafts as Record<string, Record<string, DraftRecord>>)
            : {},
      };
      return normalized;
    } catch (e) {
      console.error('Failed to parse learning db', e);
      return { kbs: [], trees: {}, contents: {}, drafts: {} };
    }
  },

  _write(data: LearningDatabase) {
    this._init();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  },

  getLearningData() {
    return this._read();
  },

  createKb(kb: KbInfo) {
    const data = this._read();
    const existing = data.kbs.find(k => k.id === kb.id);
    if (!existing) {
      data.kbs.push(kb);
      data.trees[kb.id] = { id: kb.id, title: kb.name, groups: [] };
      data.contents[kb.id] = {};
      this._write(data);
      return;
    }

    const nextTags = Array.isArray(kb.tags) ? kb.tags : [];
    existing.name = kb.name || existing.name;
    existing.subtitle = kb.subtitle ?? existing.subtitle;
    existing.tags = nextTags;
    existing.updatedAt = kb.updatedAt || existing.updatedAt;

    if (data.trees[kb.id]) {
      data.trees[kb.id].title = existing.name;
    }
    this._write(data);
  },

  ensureSubject(kbId: string, subjectId: string, subjectTitle?: string) {
    const data = this._read();
    const today = new Date().toISOString().split('T')[0];

    let kb = data.kbs.find(k => k.id === kbId);
    if (!kb) {
      kb = {
        id: kbId,
        name: kbId,
        subtitle: "",
        tags: [],
        updatedAt: today,
        stats: { topics: 0, paths: 0 }
      };
      data.kbs.push(kb);
    }

    if (!data.trees[kbId]) {
      data.trees[kbId] = { id: kbId, title: kb.name, groups: [] };
    }
    if (!data.contents[kbId]) {
      data.contents[kbId] = {};
    }

    let group = data.trees[kbId].groups.find(g => g.id === subjectId);
    if (!group) {
      group = { id: subjectId, title: subjectTitle || subjectId, children: [] };
      data.trees[kbId].groups.push(group);
      kb.updatedAt = today;
    } else if (subjectTitle && group.title !== subjectTitle) {
      group.title = subjectTitle;
      kb.updatedAt = today;
    }

    this._write(data);
  },

  addSubject(kbId: string, subjectId: string, subjectTitle: string) {
    this.ensureSubject(kbId, subjectId, subjectTitle);
  },

  addEmptyTopic(kbId: string, subjectId: string, topicId: string, topicTitle: string) {
    const data = this._read();
    
    // Ensure KB exists
    let kb = data.kbs.find(k => k.id === kbId);
    if (!kb) {
      kb = {
        id: kbId,
        name: kbId,
        subtitle: "",
        tags: [],
        updatedAt: new Date().toISOString().split('T')[0],
        stats: { topics: 0, paths: 0 }
      };
      data.kbs.push(kb);
    }

    if (!data.trees[kbId]) {
      data.trees[kbId] = { id: kbId, title: kb.name, groups: [] };
    }
    if (!data.contents[kbId]) {
      data.contents[kbId] = {};
    }

    let group = data.trees[kbId].groups.find(g => g.id === subjectId);
    if (!group) {
      group = { id: subjectId, title: subjectId, children: [] };
      data.trees[kbId].groups.push(group);
    }

    if (!group.children.find(c => c.id === topicId)) {
      group.children.push({ id: topicId, title: topicTitle });
    } else {
      const child = group.children.find(c => c.id === topicId);
      if (child) child.title = topicTitle;
    }

    if (!data.contents[kbId][topicId]) {
      data.contents[kbId][topicId] = {
        title: topicTitle,
        breadcrumb: [kb.name, group.title, topicTitle],
        quickFacts: [],
        sections: []
      };
      kb.stats.topics += 1;
      kb.updatedAt = new Date().toISOString().split('T')[0];
    }

    this._write(data);
  },

  saveTaxonomy(kbId: string, treeData: TreeData) {
    const data = this._read();
    
    // Ensure KB exists
    let kb = data.kbs.find(k => k.id === kbId);
    if (!kb) {
      kb = {
        id: kbId,
        name: kbId,
        subtitle: "",
        tags: [],
        updatedAt: new Date().toISOString().split('T')[0],
        stats: { topics: 0, paths: 0 }
      };
      data.kbs.push(kb);
    }
    
    data.trees[kbId] = treeData;
    
    if (!data.contents[kbId]) {
      data.contents[kbId] = {};
    }
    
    for (const group of treeData.groups) {
      for (const child of group.children) {
        if (!data.contents[kbId][child.id]) {
          data.contents[kbId][child.id] = {
            title: child.title,
            breadcrumb: [kb.name, group.title, child.title],
            quickFacts: [],
            sections: []
          };
          kb.stats.topics += 1;
        }
      }
    }
    kb.updatedAt = new Date().toISOString().split('T')[0];
    this._write(data);
  },

  addContent(kbId: string, subject: string, topicId: string, content: TopicContent) {
    const data = this._read();
    
    // Ensure KB exists
    let kb = data.kbs.find(k => k.id === kbId);
    if (!kb) {
      kb = {
        id: kbId,
        name: kbId,
        subtitle: "",
        tags: [],
        updatedAt: new Date().toISOString().split('T')[0],
        stats: { topics: 0, paths: 0 }
      };
      data.kbs.push(kb);
    }

    if (!data.trees[kbId]) {
      data.trees[kbId] = { id: kbId, title: kb.name, groups: [] };
    }
    if (!data.contents[kbId]) {
      data.contents[kbId] = {};
    }

    // Ensure subject group exists
    let group = data.trees[kbId].groups.find(g => g.id === subject);
    if (!group) {
      group = { id: subject, title: subject, children: [] };
      data.trees[kbId].groups.push(group);
    }

    // Ensure topic exists in group
    if (!group.children.find(c => c.id === topicId)) {
      group.children.push({ id: topicId, title: content.title });
    } else {
      const child = group.children.find(c => c.id === topicId);
      if (child) child.title = content.title;
    }

    // Add content
    const isNew = !data.contents[kbId][topicId];
    data.contents[kbId][topicId] = content;
    
    // Update stats
    if (isNew) {
      kb.stats.topics += 1;
      kb.updatedAt = new Date().toISOString().split('T')[0];
    }

    this._write(data);
  },

  createDraft(kbId: string, subject: string, summary: DraftSummary) {
    const data = this._read();
    if (!data.drafts) data.drafts = {};
    if (!data.drafts[kbId]) data.drafts[kbId] = {};

    const now = new Date().toISOString();
    const draftId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const draft: DraftRecord = {
      id: draftId,
      kbId,
      subject,
      summary,
      createdAt: now,
      updatedAt: now,
    };

    data.drafts[kbId][draftId] = draft;
    this._write(data);
    return draftId;
  },

  getDraft(kbId: string, draftId: string) {
    const data = this._read();
    const draft = data.drafts?.[kbId]?.[draftId];
    return draft || null;
  },

  updateDraft(kbId: string, draftId: string, summary: DraftSummary) {
    const data = this._read();
    const draft = data.drafts?.[kbId]?.[draftId];
    if (!draft) return null;

    draft.summary = summary;
    draft.updatedAt = new Date().toISOString();
    data.drafts[kbId][draftId] = draft;
    this._write(data);
    return draft;
  },

  deleteDraft(kbId: string, draftId: string) {
    const data = this._read();
    if (!data.drafts?.[kbId]?.[draftId]) return false;
    delete data.drafts[kbId][draftId];
    if (Object.keys(data.drafts[kbId]).length === 0) {
      delete data.drafts[kbId];
    }
    this._write(data);
    return true;
  },

  deleteKb(kbId: string) {
    const data = this._read();
    const idx = data.kbs.findIndex(k => k.id === kbId);
    if (idx === -1) return false;

    data.kbs.splice(idx, 1);
    delete data.trees[kbId];
    delete data.contents[kbId];
    if (data.drafts?.[kbId]) {
      delete data.drafts[kbId];
    }
    
    this._write(data);
    return true;
  },

  deleteTopic(kbId: string, subjectId: string, topicId: string) {
    const data = this._read();
    
    // Check if kb exists
    const kb = data.kbs.find(k => k.id === kbId);
    if (!kb) return false;

    // Check if tree exists
    const tree = data.trees[kbId];
    if (!tree) return false;

    // Find the group
    const group = tree.groups.find(g => g.id === subjectId);
    if (!group) return false;

    // Remove topic from group children
    const childIdx = group.children.findIndex(c => c.id === topicId);
    if (childIdx === -1) return false;

    group.children.splice(childIdx, 1);

    // If group is empty, remove the group
    if (group.children.length === 0) {
      const groupIdx = tree.groups.findIndex(g => g.id === subjectId);
      if (groupIdx !== -1) {
        tree.groups.splice(groupIdx, 1);
      }
    }

    // Remove content
    if (data.contents[kbId]?.[topicId]) {
      delete data.contents[kbId][topicId];
    }

    // Update stats
    kb.stats.topics = Math.max(0, kb.stats.topics - 1);
    kb.updatedAt = new Date().toISOString().split('T')[0];

    this._write(data);
    return true;
  },
};

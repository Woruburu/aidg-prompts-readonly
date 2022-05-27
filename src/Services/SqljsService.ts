import { parse } from "date-fns";
import { QueryExecResult, SqlValue } from "sql.js";
import { v4 } from "uuid";

export default class SqljsService {
  private worker: Worker;

  constructor(worker: Worker) {
    this.worker = worker;
  }

  private sqliteBoolean = (value?: SqlValue): boolean =>
    (value as number) === 1;

  private parseDate = (value?: SqlValue): Date =>
    parse(value as string, "yyyy-MM-dd HH:mm:ss.SSSSSS", new Date());

  private parseDateMaybe = (value?: SqlValue): Date | undefined =>
    value
      ? parse(value as string, "yyyy-MM-dd HH:mm:ss.SSSSSS", new Date())
      : undefined;

  private queryDb = <T>(
    exec: { sql: string; params?: object },
    map: (vals: SqlValue[]) => T
  ): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      try {
        const requestId = v4();
        console.log(requestId);

        this.worker.onmessage = (e) => {
          console.log(e);
          if (e.data.id == requestId) {
            if (e.data.error) {
              reject(e.data.error);
              return;
            }
            if (!e.data.results || e.data.results.length < 1) {
              resolve([]);
              return;
            }
            const results = e.data.results[0] as QueryExecResult;
            resolve(results.values.map(map));
          }
        };

        this.worker.postMessage({
          id: requestId,
          action: "exec",
          sql: exec.sql,
          params: exec.params,
        });
      } catch (e) {
        reject(e);
      }
    });
  };

  search = async (options: SearchOptions): Promise<HomePrompt[]> => {
    const titleSearch =
      options.title !== "" ? ` AND Title LIKE "%${options.title}%"` : "";

    const nsfwSearch =
      options.nsfw !== "SFW & NSFW"
        ? ` AND Nsfw = ${options.nsfw === "NSFW only" ? "1" : "0"}`
        : "";

    const tagList = options.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) =>
        options.matchTagsExactly
          ? `(Tags LIKE '${tag},%' OR Tags LIKE '%, ${tag},%')`
          : `Tags LIKE '%${tag}%'`
      )
      .join(options.tagSearchOption === "Match All Tags" ? " AND " : " OR ");

    const tagSearch = tagList
      ? ` AND${
          options.tagSearchOption === "Exclude All Tags" ? " NOT" : ""
        } (${tagList})`
      : "";

    console.log(`SELECT Title, PublishDate, Nsfw, Tags, Description, CorrelationId, PromptContent
    FROM Prompts
    WHERE ParentId IS NULL${titleSearch}${nsfwSearch}${tagSearch}
    ORDER BY PublishDate ${
      options.reverseSearch ? "ASC" : "DESC"
    }, DateCreated ${options.reverseSearch ? "ASC" : "DESC"}
    LIMIT 12`);

    return await this.queryDb<HomePrompt>(
      {
        sql: `SELECT Title, PublishDate, Nsfw, Tags, Description, CorrelationId, PromptContent, DateCreated
FROM Prompts
WHERE ParentId IS NULL${titleSearch}${nsfwSearch}${tagSearch}
ORDER BY PublishDate ${options.reverseSearch ? "ASC" : "DESC"}, DateCreated ${
          options.reverseSearch ? "ASC" : "DESC"
        }
LIMIT 12`,
      },
      (vals) => ({
        Title: vals[0] as string,
        PublishDate: this.parseDateMaybe(vals[1]),
        Nsfw: this.sqliteBoolean(vals[2]),
        Tags: vals[3] as string,
        Description: vals[4] as string,
        CorrelationId: vals[5] as number,
        PromptContent: vals[6] as string,
        DateCreated: this.parseDate(vals[7]),
      })
    );
  };

  get = async (id: string): Promise<Prompt | undefined> => {
    const prompt = (
      await this.queryDb<Prompt>(
        {
          sql: `SELECT Id, AuthorsNote, Description, Memory, Nsfw, ParentId, PromptContent, PublishDate, Quests, Tags, Title, ScriptZip, NovelAiScenario, HoloAiScenario, CorrelationId, DateCreated, DateEdited
FROM Prompts
WHERE CorrelationId = ${id}
LIMIT 1`,
        },
        (vals) => ({
          AuthorsNote: vals[1] as string,
          Description: vals[2] as string,
          Memory: vals[3] as string,
          Nsfw: this.sqliteBoolean(vals[4]),
          ParentId: vals[5] as number,
          PromptContent: vals[6] as string,
          PublishDate: this.parseDateMaybe(vals[7]),
          Quests: vals[8] as string,
          Tags: vals[9] as string,
          Title: vals[10] as string,
          ScriptZip: vals[11] as Uint8Array,
          NovelAiScenario: vals[12] as string,
          HoloAiScenario: vals[13] as string,
          CorrelationId: vals[14] as number,
          DateCreated: this.parseDate(vals[15]),
          DateEdited: this.parseDateMaybe(vals[16]),
          WorldInfos: [],
          Children: [],
        })
      )
    )[0];

    if (prompt) {
      prompt.WorldInfos = await this.queryDb<WorldInfo>(
        {
          sql: `SELECT Entry, Keys
FROM WorldInfos
WHERE PromptId = ${prompt.CorrelationId}`,
        },
        (vals) => {
          return {
            Entry: vals[0] as string,
            Keys: vals[1] as string,
          };
        }
      );
      prompt.Children = await this.queryDb<Child>(
        {
          sql: `SELECT CorrelationId, Title
FROM Prompts
WHERE ParentId = ${prompt.CorrelationId}`,
        },
        (vals) => ({ Id: vals[0] as number, Title: vals[1] as string })
      );
    }

    return prompt;
  };
}

export interface HomePrompt {
  Title: string;
  PublishDate?: Date;
  Nsfw: boolean;
  Tags: string;
  Description?: string;
  CorrelationId: number;
  PromptContent: string;
  DateCreated: Date;
}

export interface Prompt extends HomePrompt {
  AuthorsNote?: string;
  Memory?: string;
  ParentId?: number;
  Quests?: string;
  ScriptZip?: Uint8Array;
  NovelAiScenario?: string;
  HoloAiScenario?: string;
  DateEdited?: Date;
  WorldInfos: WorldInfo[];
  Children: Child[];
}

export interface WorldInfo {
  Entry: string;
  Keys: string;
}

export interface Child {
  Id: number;
  Title: string;
}

export const NsfwSearch = <const>["SFW & NSFW", "SFW only", "NSFW only"];
export type NsfwSearchType = typeof NsfwSearch[number];

export const TagSearchOptions = <const>[
  "Match All Tags",
  "Match Any Tag",
  "Exclude All Tags",
];
export type TagSearchOptionsType = typeof TagSearchOptions[number];

export interface SearchOptions {
  title: string;
  nsfw: NsfwSearchType;
  tags: string;
  tagSearchOption: TagSearchOptionsType;
  matchTagsExactly: boolean;
  reverseSearch: boolean;
}